// Normalizer: cleans and standardizes extracted fields

import type { ExtractedFields } from '@/types';
import { parseIndianDate } from '@/lib/utils';

/**
 * Normalizes extracted invoice fields
 * - Standardizes dates to ISO format
 * - Cleans amounts
 * - Trims whitespace
 * - Fixes common OCR errors
 */
export function normalizeExtractedFields(fields: ExtractedFields): ExtractedFields {
  return {
    ...fields,
    vendorName: normalizeText(fields.vendorName),
    vendorGstin: normalizeGSTIN(fields.vendorGstin),
    invoiceNumber: normalizeInvoiceNumber(fields.invoiceNumber),
    invoiceDate: parseIndianDate(fields.invoiceDate) ?? fields.invoiceDate,
    dueDate: parseIndianDate(fields.dueDate) ?? fields.dueDate,
    placeOfSupply: normalizeText(fields.placeOfSupply),
    taxableAmount: normalizeAmount(fields.taxableAmount),
    cgst: normalizeAmount(fields.cgst),
    sgst: normalizeAmount(fields.sgst),
    igst: normalizeAmount(fields.igst),
    totalAmount: normalizeAmount(fields.totalAmount),
    remarks: normalizeText(fields.remarks),
  };
}

function normalizeText(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[:\-\s]+/, '')
    .replace(/[:\-\s]+$/, '');
}

function normalizeGSTIN(gstin: string | undefined | null): string | undefined {
  if (!gstin) return undefined;
  // Uppercase, remove spaces
  const cleaned = gstin.toUpperCase().replace(/\s/g, '');
  // Validate format
  if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned; // return even if invalid, let user review
}

function normalizeInvoiceNumber(invNo: string | undefined | null): string | undefined {
  if (!invNo) return undefined;
  return invNo
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/^[#:\-\s]+/, '')
    .trim();
}

function normalizeAmount(amount: number | undefined | null): number | undefined {
  if (amount == null) return undefined;
  // Round to 2 decimal places
  return Math.round(amount * 100) / 100;
}
