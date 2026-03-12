// OCR Service Client
// Calls the Python FastAPI OCR microservice.
// Falls back to Tesseract.js if the service is unavailable.
//
// The service URL is configured via OCR_SERVICE_URL env var.
// In Railway: set OCR_SERVICE_URL to the internal URL of the ocr-service
//   e.g. http://ocr-service.railway.internal:8001
// In local dev with docker-compose: http://localhost:8001

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

export interface OcrServiceResult {
  text: string;
  confidence: number;    // 0.0–1.0 from PaddleOCR
  method: string;        // 'paddleocr' | 'paddleocr-pdf' | 'tesseract' | 'none'
  pageCount: number;
  wordCount: number;
  error?: string;
}

const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || '';
const OCR_TIMEOUT_MS = parseInt(process.env.OCR_TIMEOUT_MS || '30000', 10);

/**
 * Calls the OCR service (PaddleOCR) for the given file.
 * Returns null if the service is unavailable, so the caller can fall back.
 */
export async function callOcrService(
  filePath: string,
  mimeType: string
): Promise<OcrServiceResult | null> {
  if (!OCR_SERVICE_URL) {
    return null;  // service not configured, caller will use Tesseract
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Use FormData for multipart upload (works in Node.js without a browser)
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: mimeType,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${OCR_SERVICE_URL}/ocr`, {
        method: 'POST',
        // @ts-expect-error FormData from 'form-data' is not identical to browser FormData
        body: formData,
        headers: formData.getHeaders(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.warn(`[OcrClient] OCR service returned ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      text: string;
      confidence: number;
      method: string;
      page_count: number;
      word_count: number;
      error?: string;
    };

    return {
      text: data.text || '',
      confidence: data.confidence ?? 0,
      method: data.method || 'paddleocr',
      pageCount: data.page_count ?? 1,
      wordCount: data.word_count ?? 0,
      error: data.error,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Timeout or connection refused – service is down, not a fatal error
    if (msg.includes('abort') || msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
      console.warn(`[OcrClient] OCR service unavailable: ${msg}`);
    } else {
      console.error(`[OcrClient] Unexpected error: ${msg}`);
    }
    return null;
  }
}

/**
 * Check if the OCR service is reachable.
 * Used in the health endpoint and startup logging.
 */
export async function checkOcrServiceHealth(): Promise<boolean> {
  if (!OCR_SERVICE_URL) return false;
  try {
    const res = await fetch(`${OCR_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
