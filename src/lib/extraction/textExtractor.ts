// Text extraction from files
// Strategy: native PDF text first, then OCR via Tesseract, then Claude Vision API

import fs from 'fs';
import path from 'path';

export interface TextExtractionResult {
  text: string;
  pageCount: number;
  method: string;
  error?: string;
}

/**
 * Extracts text from a file using the best available method
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
  originalName: string
): Promise<TextExtractionResult> {
  const ext = path.extname(originalName).toLowerCase();

  // Route to the right extractor
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return extractFromPdf(filePath);
  }

  if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mimeType)
    || ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext)) {
    return extractFromImage(filePath);
  }

  return {
    text: '',
    pageCount: 1,
    method: 'none',
    error: `Unsupported file type: ${mimeType}`,
  };
}

/**
 * Extracts text from a PDF file
 * First tries native text extraction, falls back to OCR
 */
async function extractFromPdf(filePath: string): Promise<TextExtractionResult> {
  // Try native text extraction first (fast, high quality for digital PDFs)
  try {
    // Dynamic import to avoid issues when pdf-parse is not available in edge runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    const text = data.text.trim();
    const pageCount = data.numpages;

    // If we got meaningful text (more than 50 chars), use it
    if (text.length > 50) {
      return {
        text,
        pageCount,
        method: 'pdf-native',
      };
    }

    // Text too short → likely scanned PDF, fall through to OCR
    console.log('[Extraction] PDF has minimal native text, falling back to OCR');
  } catch (err) {
    console.warn('[Extraction] pdf-parse failed:', err);
  }

  // Fall back to OCR using Claude Vision API if available
  return extractFromImage(filePath, true);
}

/**
 * Extracts text from an image using OCR
 * Uses Claude Vision API for high quality, server-side only
 */
async function extractFromImage(
  filePath: string,
  isPdfPage = false
): Promise<TextExtractionResult> {
  // Use Claude Vision API for extraction (best quality for Indian invoices)
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await extractWithClaudeVision(filePath, isPdfPage);
    } catch (err) {
      console.warn('[Extraction] Claude Vision failed, trying Tesseract:', err);
    }
  }

  // Fallback: Tesseract.js OCR
  try {
    return await extractWithTesseract(filePath);
  } catch (err) {
    return {
      text: '',
      pageCount: 1,
      method: 'none',
      error: `OCR failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extracts structured text using Claude Vision API
 * This gives the best results for messy/handwritten invoices
 */
async function extractWithClaudeVision(
  filePath: string,
  isPdfPage = false
): Promise<TextExtractionResult> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let imageBuffer: Buffer;
  let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

  // For PDFs, convert first page to image using sharp
  if (isPdfPage) {
    // Read PDF and get the raw data as base64 (we'll send the PDF)
    imageBuffer = fs.readFileSync(filePath);
    // For PDFs, use the PDF directly - Claude can handle them
    const base64 = imageBuffer.toString('base64');

    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [
            {
              type: 'text',
              text: `You are an OCR and document extraction assistant. Extract ALL text from this document exactly as it appears, preserving the structure. Include ALL numbers, dates, amounts, GSTIN numbers, invoice numbers, vendor names, addresses, line items, and any other text. Format it clearly with labels. Do not summarize - extract all raw text.`,
            },
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          ],
        },
      ],
    });

    const content = response.content[0];
    const text = content.type === 'text' ? content.text : '';

    return {
      text,
      pageCount: 1,
      method: 'claude-vision-pdf',
    };
  }

  // For images
  imageBuffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') mediaType = 'image/png';
  else if (ext === '.webp') mediaType = 'image/webp';
  const base64 = imageBuffer.toString('base64');

  const response = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are an OCR and document extraction assistant. Extract ALL text from this invoice/document image exactly as it appears. Include ALL numbers, dates, amounts, GSTIN, invoice numbers, vendor names, addresses, line items. Preserve structure. Return raw extracted text only.`,
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  const text = content.type === 'text' ? content.text : '';

  return {
    text,
    pageCount: 1,
    method: 'claude-vision-image',
  };
}

/**
 * Fallback OCR using Tesseract.js
 * Works without API key but quality is lower for complex documents
 */
async function extractWithTesseract(filePath: string): Promise<TextExtractionResult> {
  // Tesseract.js works in browser and Node but needs the worker path
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');

  try {
    const result = await worker.recognize(filePath);
    await worker.terminate();

    return {
      text: result.data.text,
      pageCount: 1,
      method: 'tesseract',
    };
  } catch (err) {
    await worker.terminate();
    throw err;
  }
}
