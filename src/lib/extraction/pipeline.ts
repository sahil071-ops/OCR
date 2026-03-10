// Shared extraction pipeline used by both upload and batch-process routes

import prisma from '@/lib/db';
import { extractFromFile } from '@/lib/extraction';
import { extractFieldsWithClaude } from '@/lib/extraction/claudeExtractor';
import { matchVendor, buildConfidenceData, calculateOverallConfidence } from '@/lib/matching';

export async function runExtractionPipeline(
  documentId: string,
  filePath: string,
  mimeType: string,
  originalName: string
) {
  try {
    console.log(`[Extraction] Starting for document ${documentId}`);

    const extractionResult = await extractFromFile(filePath, mimeType, originalName);

    let fields = extractionResult.fields;
    if (process.env.ANTHROPIC_API_KEY && extractionResult.rawText.length > 50) {
      const claudeResult = await extractFieldsWithClaude(extractionResult.rawText);
      if (!claudeResult.error) {
        fields = {
          ...fields,
          ...Object.fromEntries(
            Object.entries(claudeResult.fields).filter(([, v]) => v != null && v !== undefined)
          ),
        };
      }
    }

    const matchResult = await matchVendor(fields.vendorName, fields.vendorGstin);
    const confidenceData = buildConfidenceData(fields as Record<string, unknown>, matchResult);
    const overallConfidence = calculateOverallConfidence(confidenceData);

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

    await prisma.extractedDocument.update({
      where: { id: documentId },
      data: {
        status: 'EXTRACTED',
        rawText: extractionResult.rawText,
        pageCount: extractionResult.pageCount,
        documentType: (fields.documentType || 'UNKNOWN') as
          | 'TAX_INVOICE' | 'SERVICE_INVOICE' | 'FREIGHT'
          | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'BILL' | 'UNKNOWN',
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
        ...vendorDefaults,
        confidenceData: confidenceData as object,
        overallConfidence,
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
