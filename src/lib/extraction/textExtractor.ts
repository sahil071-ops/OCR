// Text extraction from files
//
// Priority order (cheapest first):
//   1. Native PDF text (pdf-parse)         – free, instant
//   2. PaddleOCR via OCR microservice      – cheap, self-hosted
//   3. Tesseract.js                        – free, lower quality fallback
//   4. Claude Vision                       – ONLY called from the rescue lane
//                                            in pipeline.ts when OCR failed badly
//
// This file does NOT call Claude. Claude is called in pipeline.ts (Lane B only).

import fs from 'fs';
import path from 'path';
import { callOcrService } from './ocrClient';

export interface TextExtractionResult {
  text: string;
  pageCount: number;
  method: string;        // pdf-native | paddleocr | paddleocr-pdf | tesseract | none
  ocrConfidence: number | null;  // 0–1 from PaddleOCR; null for pdf-native/tesseract
  error?: string;
}

// Minimum native text length to trust a PDF (otherwise treat as scanned)
const MIN_PDF_TEXT_LENGTH = 50;

/**
 * Extracts text from a file using the cheapest available method.
 * Does NOT call Claude – Claude is reserved for the rescue lane in pipeline.ts.
 */
export async function extractTextFromFile(
  filePath: string,
  mimeType: string,
  originalName: string
): Promise<TextExtractionResult> {
  const ext = path.extname(originalName).toLowerCase();

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return extractFromPdf(filePath);
  }

  if (isImageMime(mimeType) || isImageExt(ext)) {
    return extractFromImage(filePath, mimeType);
  }

  return { text: '', pageCount: 1, method: 'none', ocrConfidence: null,
           error: `Unsupported file type: ${mimeType}` };
}

// ─────────────────────────────────────────────
// PDF extraction
// ─────────────────────────────────────────────

async function extractFromPdf(filePath: string): Promise<TextExtractionResult> {
  // Step 1: Try native text extraction (instant, free, perfect for digital PDFs)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const text = (data.text || '').trim();

    if (text.length >= MIN_PDF_TEXT_LENGTH) {
      return {
        text,
        pageCount: data.numpages || 1,
        method: 'pdf-native',
        ocrConfidence: null,  // native text = no OCR confidence needed
      };
    }
    console.log('[TextExtractor] PDF minimal native text, trying OCR');
  } catch (err) {
    console.warn('[TextExtractor] pdf-parse failed:', err);
  }

  // Step 2: Scanned PDF → OCR service (PaddleOCR)
  return extractFromImage(filePath, 'application/pdf');
}

// ─────────────────────────────────────────────
// Image extraction (also handles scanned PDFs)
// ─────────────────────────────────────────────

async function extractFromImage(
  filePath: string,
  mimeType: string
): Promise<TextExtractionResult> {

  // Step 1: OCR microservice (PaddleOCR + OpenCV preprocessing)
  const ocrResult = await callOcrService(filePath, mimeType);
  if (ocrResult && !ocrResult.error && ocrResult.text.trim().length > 20) {
    return {
      text: ocrResult.text,
      pageCount: ocrResult.pageCount,
      method: ocrResult.method,
      ocrConfidence: ocrResult.confidence,
    };
  }

  if (ocrResult?.error) {
    console.warn(`[TextExtractor] OCR service error: ${ocrResult.error}`);
  }

  // Step 2: Tesseract.js fallback (no OCR service or OCR returned empty)
  try {
    const result = await extractWithTesseract(filePath);
    return result;
  } catch (err) {
    console.error('[TextExtractor] Tesseract failed:', err);
    return {
      text: '',
      pageCount: 1,
      method: 'none',
      ocrConfidence: 0,
      error: `All OCR methods failed. Last error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─────────────────────────────────────────────
// Tesseract.js fallback
// ─────────────────────────────────────────────

async function extractWithTesseract(filePath: string): Promise<TextExtractionResult> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(filePath);
    await worker.terminate();
    return {
      text: result.data.text || '',
      pageCount: 1,
      method: 'tesseract',
      ocrConfidence: result.data.confidence != null
        ? result.data.confidence / 100  // Tesseract returns 0–100
        : null,
    };
  } catch (err) {
    await worker.terminate();
    throw err;
  }
}

// ─────────────────────────────────────────────
// Claude Vision – kept here but ONLY called from pipeline.ts rescue lane
// ─────────────────────────────────────────────

/**
 * Called by the rescue lane in pipeline.ts when OCR confidence is very low.
 * Do NOT call this from anywhere else.
 */
export async function extractWithClaudeVision(
  filePath: string,
  mimeType: string
): Promise<TextExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { text: '', pageCount: 1, method: 'none', ocrConfidence: null,
             error: 'No Anthropic API key configured' };
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const ext = path.extname(filePath).toLowerCase();
  const isPdf = mimeType === 'application/pdf' || ext === '.pdf';
  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString('base64');

  const prompt = `Extract ALL text from this invoice exactly as it appears.
Include all numbers, dates, amounts, GSTIN, invoice numbers, vendor name, address,
line items. Preserve structure. Return raw text only.`;

  try {
    let content;
    if (isPdf) {
      const response = await client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
          ],
        }],
      });
      content = response.content[0];
    } else {
      let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
      if (ext === '.png') mediaType = 'image/png';
      else if (ext === '.webp') mediaType = 'image/webp';
      const response = await client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          ],
        }],
      });
      content = response.content[0];
    }

    const text = content.type === 'text' ? content.text : '';
    return { text, pageCount: 1, method: 'claude-vision', ocrConfidence: null };
  } catch (err) {
    return {
      text: '',
      pageCount: 1,
      method: 'claude-vision',
      ocrConfidence: null,
      error: err instanceof Error ? err.message : 'Claude Vision failed',
    };
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function isImageMime(mime: string): boolean {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(mime);
}

function isImageExt(ext: string): boolean {
  return ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(ext);
}
