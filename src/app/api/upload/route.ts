// POST /api/upload - handles file upload and triggers extraction
// Accepts multipart/form-data with file + sessionId

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import { extractFromFile } from '@/lib/extraction';
import { extractFieldsWithClaude } from '@/lib/extraction/claudeExtractor';
import { matchVendor, buildConfidenceData, calculateOverallConfidence } from '@/lib/matching';

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export async function POST(request: NextRequest) {
  let filePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sessionId = formData.get('sessionId') as string | null;

    // Validate inputs
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'No sessionId provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${file.type}. Allowed: PDF, JPEG, PNG, WebP, HEIC` },
        { status: 400 }
      );
    }

    // Validate session exists
    const session = await prisma.scanSession.findUnique({
      where: { id: sessionId, status: 'ACTIVE' },
    });
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found or not active' },
        { status: 404 }
      );
    }

    // Save file to disk
    const uploadsDir = path.join(process.cwd(), 'uploads', sessionId);
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const ext = path.extname(file.name) || '.bin';
    const savedFileName = `${uuidv4()}${ext}`;
    filePath = path.join(uploadsDir, savedFileName);
    const relativePath = `/uploads/${sessionId}/${savedFileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Create document record as PROCESSING
    const doc = await prisma.extractedDocument.create({
      data: {
        sessionId,
        fileName: file.name,
        fileType: file.type,
        filePath: relativePath,
        fileSize: file.size,
        status: 'PROCESSING',
      },
    });

    // Run extraction pipeline asynchronously
    // We update the DB record when done
    runExtractionPipeline(doc.id, filePath, file.type, file.name).catch(err => {
      console.error('[Upload] Background extraction failed:', err);
    });

    return NextResponse.json({
      success: true,
      data: {
        documentId: doc.id,
        fileName: file.name,
        status: 'processing',
        message: 'Upload successful, extraction in progress',
      },
    }, { status: 201 });

  } catch (error) {
    console.error('[Upload POST]', error);
    return NextResponse.json(
      { success: false, error: 'Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

/**
 * Runs the full extraction → matching → update pipeline for a document
 * This runs in the background after the upload response is sent
 */
async function runExtractionPipeline(
  documentId: string,
  filePath: string,
  mimeType: string,
  originalName: string
) {
  try {
    console.log(`[Extraction] Starting for document ${documentId}`);

    // Step 1: Extract raw text + basic field parsing
    const extractionResult = await extractFromFile(filePath, mimeType, originalName);

    // Step 2: Use Claude for better structured extraction if API key available
    let fields = extractionResult.fields;
    if (process.env.ANTHROPIC_API_KEY && extractionResult.rawText.length > 50) {
      const claudeResult = await extractFieldsWithClaude(extractionResult.rawText);
      if (!claudeResult.error) {
        // Merge Claude results (prefer Claude's output, fall back to regex)
        fields = {
          ...fields,
          ...Object.fromEntries(
            Object.entries(claudeResult.fields).filter(([, v]) => v != null && v !== undefined)
          ),
        };
      }
    }

    // Step 3: Match vendor from master data
    const matchResult = await matchVendor(fields.vendorName, fields.vendorGstin);

    // Step 4: Build confidence scores
    const confidenceData = buildConfidenceData(fields as Record<string, unknown>, matchResult);
    const overallConfidence = calculateOverallConfidence(confidenceData);

    // Step 5: Apply vendor defaults
    const vendorDefaults = matchResult.vendor
      ? {
          vendorId: matchResult.vendor.id,
          vendorCode: matchResult.vendor.vendorCode,
          glAccount: matchResult.vendor.defaultGlAccount,
          taxCode: matchResult.vendor.defaultTaxCode,
          tdsCode: matchResult.vendor.defaultTdsCode,
          distributionRule: matchResult.vendor.defaultDistRule,
        }
      : {};

    // Step 6: Detect duplicates within the session
    const doc = await prisma.extractedDocument.findUnique({
      where: { id: documentId },
      select: { sessionId: true },
    });

    let isDuplicate = false;
    let duplicateOfId: string | null = null;

    if (doc && fields.invoiceNumber && fields.vendorGstin) {
      const existing = await prisma.extractedDocument.findFirst({
        where: {
          sessionId: doc.sessionId,
          invoiceNumber: fields.invoiceNumber,
          vendorGstin: fields.vendorGstin,
          id: { not: documentId },
        },
      });
      if (existing) {
        isDuplicate = true;
        duplicateOfId = existing.id;
      }
    }

    // Step 7: Update document record
    await prisma.extractedDocument.update({
      where: { id: documentId },
      data: {
        status: 'EXTRACTED',
        rawText: extractionResult.rawText,
        pageCount: extractionResult.pageCount,
        documentType: (fields.documentType || 'UNKNOWN') as 'TAX_INVOICE' | 'SERVICE_INVOICE' | 'FREIGHT' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'BILL' | 'UNKNOWN',

        // Extracted fields
        vendorName: fields.vendorName,
        vendorGstin: fields.vendorGstin,
        invoiceNumber: fields.invoiceNumber,
        invoiceDate: fields.invoiceDate,
        dueDate: fields.dueDate,
        placeOfSupply: fields.placeOfSupply,
        taxableAmount: fields.taxableAmount,
        cgst: fields.cgst,
        sgst: fields.sgst,
        igst: fields.igst,
        totalAmount: fields.totalAmount,
        currency: fields.currency || 'INR',
        lineItems: (fields.lineItems as object[]) || [],
        remarks: fields.remarks,

        // Master-matched fields
        ...vendorDefaults,

        // Confidence
        confidenceData: confidenceData as object,
        overallConfidence,

        // Duplicate detection
        isDuplicate,
        duplicateOfId,
      },
    });

    console.log(`[Extraction] Completed for document ${documentId}, confidence: ${overallConfidence}`);
  } catch (error) {
    console.error(`[Extraction] Failed for document ${documentId}:`, error);
    await prisma.extractedDocument.update({
      where: { id: documentId },
      data: {
        status: 'ERROR',
        processingError: error instanceof Error ? error.message : 'Unknown extraction error',
      },
    }).catch(e => console.error('[Extraction] Failed to update error status:', e));
  }
}
