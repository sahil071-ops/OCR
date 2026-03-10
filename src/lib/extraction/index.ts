// Extraction pipeline orchestrator
// Coordinates: text extraction → structured parsing → normalization

import { extractTextFromFile } from './textExtractor';
import { parseInvoiceFields } from './fieldParser';
import { normalizeExtractedFields } from './normalizer';
import type { ExtractedFields } from '@/types';

export interface ExtractionResult {
  rawText: string;
  fields: ExtractedFields;
  pageCount: number;
  method: string;  // which extraction method succeeded
  errors: string[];
}

/**
 * Main extraction entry point.
 * Accepts a file path + mime type and returns extracted structured data.
 */
export async function extractFromFile(
  filePath: string,
  mimeType: string,
  originalName: string
): Promise<ExtractionResult> {
  const errors: string[] = [];

  // Step 1: Extract raw text
  const textResult = await extractTextFromFile(filePath, mimeType, originalName);
  if (textResult.error) {
    errors.push(textResult.error);
  }

  const rawText = textResult.text || '';

  // Step 2: Parse structured fields from raw text
  const fields = parseInvoiceFields(rawText, mimeType);

  // Step 3: Normalize the parsed fields
  const normalized = normalizeExtractedFields(fields);

  return {
    rawText,
    fields: normalized,
    pageCount: textResult.pageCount || 1,
    method: textResult.method,
    errors,
  };
}
