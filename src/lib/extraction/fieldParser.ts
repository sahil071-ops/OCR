// Field parser: extracts structured invoice fields from raw text
// Uses regex patterns tuned for Indian invoice formats

import type { ExtractedFields, LineItem, DocumentType } from '@/types';

/**
 * Main field parsing function
 * Takes raw text from OCR/extraction and returns structured invoice fields
 */
export function parseInvoiceFields(rawText: string, mimeType?: string): ExtractedFields {
  const text = rawText || '';

  return {
    vendorName: extractVendorName(text),
    vendorGstin: extractGSTIN(text),
    invoiceNumber: extractInvoiceNumber(text),
    invoiceDate: extractInvoiceDate(text),
    dueDate: extractDueDate(text),
    placeOfSupply: extractPlaceOfSupply(text),
    taxableAmount: extractTaxableAmount(text),
    cgst: extractCGST(text),
    sgst: extractSGST(text),
    igst: extractIGST(text),
    totalAmount: extractTotalAmount(text),
    lineItems: extractLineItems(text),
    remarks: extractRemarks(text),
    documentType: classifyDocumentType(text),
    currency: 'INR',
  };
}

// ─────────────────────────────────────────────
// GSTIN EXTRACTION
// ─────────────────────────────────────────────

function extractGSTIN(text: string): string | undefined {
  // GSTIN format: 2 digits + 5 alpha + 4 digits + 1 alpha + 1 alphanumeric + Z + 1 alphanumeric
  const gstinPattern = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/gi;
  const matches = text.match(gstinPattern);

  if (matches && matches.length > 0) {
    // Return the FIRST GSTIN found (vendor GSTIN is usually at top)
    return matches[0].toUpperCase();
  }
  return undefined;
}

// ─────────────────────────────────────────────
// INVOICE NUMBER EXTRACTION
// ─────────────────────────────────────────────

function extractInvoiceNumber(text: string): string | undefined {
  const patterns = [
    // "Invoice No" / "Invoice Number" / "Invoice #" followed by value
    /(?:invoice\s*(?:no\.?|number|#|num)[\s:]*)([\w\-\/]+)/gi,
    /(?:inv\.?\s*no\.?[\s:]*)([\w\-\/]+)/gi,
    /(?:bill\s*no\.?[\s:]*)([\w\-\/]+)/gi,
    /(?:tax\s*invoice\s*(?:no\.?|#)?[\s:]*)([\w\-\/]+)/gi,
    // GC NO format used in transport documents
    /(?:gc\s*no\.?[\s:]*)([\w\-\/]+)/gi,
    // Common prefix patterns like INV-001, M/KAL/0079/24-25
    /\b((?:INV|TAX|BILL|GC|GST|SER|MH|DL|KA)\s*[\-\/]?\s*[\w\-\/]+)\b/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1] && match[1].length >= 3 && match[1].length <= 40) {
      return match[1].trim();
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────
// DATE EXTRACTION
// ─────────────────────────────────────────────

function extractInvoiceDate(text: string): string | undefined {
  const patterns = [
    /(?:invoice\s*date[\s:]*)([\d]{1,2}[\/\-\.][\d]{1,2}[\/\-\.][\d]{2,4})/gi,
    /(?:date[\s:]*)([\d]{1,2}[\/\-\.][\d]{1,2}[\/\-\.][\d]{2,4})/gi,
    /(?:dated[\s:]*)([\d]{1,2}[\/\-\.][\d]{1,2}[\/\-\.][\d]{2,4})/gi,
    // Date with month name
    /(?:date[\s:]*)([\d]{1,2}\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*[\d]{2,4})/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Try to find any standalone date
  const datePattern = /\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/g;
  const match = datePattern.exec(text);
  if (match) return match[1];

  return undefined;
}

function extractDueDate(text: string): string | undefined {
  const patterns = [
    /(?:due\s*date[\s:]*)([\d]{1,2}[\/\-\.][\d]{1,2}[\/\-\.][\d]{2,4})/gi,
    /(?:payment\s*due[\s:]*)([\d]{1,2}[\/\-\.][\d]{1,2}[\/\-\.][\d]{2,4})/gi,
    /(?:pay\s*by[\s:]*)([\d]{1,2}[\/\-\.][\d]{1,2}[\/\-\.][\d]{2,4})/gi,
    // "7 DAYS" → compute from invoice date? Store it as-is for now
    /(?:payment\s*(?:due|terms)[\s:]*)([\w\s]+(?:days|day))/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) return match[1].trim();
  }
  return undefined;
}

// ─────────────────────────────────────────────
// VENDOR NAME EXTRACTION
// ─────────────────────────────────────────────

function extractVendorName(text: string): string | undefined {
  // Look for company names in the document header area
  // Use first few lines of text
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  // Check top lines for business name indicators
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    // Skip very short lines, numbers-only, addresses
    if (line.length < 5 || /^\d+$/.test(line)) continue;
    // Skip if looks like a date or GSTIN
    if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(line)) continue;
    if (/^[0-9]{2}[A-Z]{5}[0-9]{4}/.test(line)) continue;
    // Skip if looks like an address line (has PIN code pattern)
    if (/\b\d{6}\b/.test(line) || /(?:street|road|nagar|colony|plot|sector)/i.test(line)) continue;

    // If it has business suffix, it's likely a vendor name
    if (/\b(pvt|ltd|llp|private|limited|inc|corp|co\.|carriers|logistics|transport|enterprises|traders|industries|services|solutions|works)\b/i.test(line)) {
      return line;
    }
  }

  // Look for explicit "From:" labels
  const fromMatch = text.match(/(?:from|seller|supplier|vendor)[\s:]*([A-Z][^\n]{5,60})/i);
  if (fromMatch) return fromMatch[1].trim();

  // Look for "Company Name:" label
  const nameMatch = text.match(/(?:company\s*name|firm\s*name|business\s*name)[\s:]*([^\n]+)/i);
  if (nameMatch) return nameMatch[1].trim();

  // Last resort: return the first meaningful non-address line
  return lines.find(l => l.length > 5 && /[A-Za-z]/.test(l)) || undefined;
}

// ─────────────────────────────────────────────
// AMOUNT EXTRACTION
// ─────────────────────────────────────────────

function extractAmount(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      // Remove commas from numbers like 1,23,456.78
      const cleaned = match[1].replace(/,/g, '').trim();
      const num = parseFloat(cleaned);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return undefined;
}

function extractTaxableAmount(text: string): number | undefined {
  return extractAmount(text, [
    /(?:taxable\s*(?:value|amount|base)[\s:]*(?:rs\.?\s*)?)([0-9,]+\.?[0-9]*)/gi,
    /(?:sub\s*total|subtotal)[\s:]*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
    /(?:assessable\s*value)[\s:]*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
    /(?:total\s*(?:before\s*tax|excluding|excl\.?))[\s:]*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
  ]);
}

function extractCGST(text: string): number | undefined {
  return extractAmount(text, [
    /(?:cgst|central\s*gst)[\s@\d%]*[:=]?\s*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
    /(?:cgst\s*amount)[\s:]*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
  ]);
}

function extractSGST(text: string): number | undefined {
  return extractAmount(text, [
    /(?:sgst|state\s*gst)[\s@\d%]*[:=]?\s*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
    /(?:sgst\s*amount)[\s:]*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
  ]);
}

function extractIGST(text: string): number | undefined {
  return extractAmount(text, [
    /(?:igst|integrated\s*gst)[\s@\d%]*[:=]?\s*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
    /(?:igst\s*amount)[\s:]*(?:rs\.?\s*)?([0-9,]+\.?[0-9]*)/gi,
  ]);
}

function extractTotalAmount(text: string): number | undefined {
  return extractAmount(text, [
    /(?:grand\s*total|total\s*amount|amount\s*(?:payable|due|total)|invoice\s*total|net\s*payable)[\s:]*(?:rs\.?\s*|inr\s*)?([0-9,]+\.?[0-9]*)/gi,
    /(?:total\s*inr)[\s:]*([0-9,]+\.?[0-9]*)/gi,
    /(?:total[\s:]*)([0-9,]+\.?[0-9]*)\s*$/gim,
  ]);
}

// ─────────────────────────────────────────────
// PLACE OF SUPPLY
// ─────────────────────────────────────────────

function extractPlaceOfSupply(text: string): string | undefined {
  const posMatch = text.match(/(?:place\s*of\s*supply|pos)[\s:]*([^\n,]{2,30})/i);
  if (posMatch) return posMatch[1].trim();

  // Try to infer from GSTIN state code
  const gstinPattern = /\b([0-9]{2})[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/gi;
  const match = gstinPattern.exec(text);
  if (match) {
    const stateCode = parseInt(match[1], 10);
    const stateCodes: Record<number, string> = {
      27: 'Maharashtra', 29: 'Karnataka', 33: 'Tamil Nadu', 36: 'Telangana',
      32: 'Kerala', 24: 'Gujarat', 7: 'Delhi', 9: 'Uttar Pradesh',
      19: 'West Bengal', 28: 'Andhra Pradesh',
    };
    return stateCodes[stateCode];
  }

  return undefined;
}

// ─────────────────────────────────────────────
// LINE ITEMS
// ─────────────────────────────────────────────

function extractLineItems(text: string): LineItem[] {
  const items: LineItem[] = [];

  // Look for tabular data with quantity + price patterns
  const linePattern = /^(.{10,60})\s+(\d+(?:\.\d+)?)\s+(\d+(?:[,\.]\d+)*)\s+(\d+(?:[,\.]\d+)*)\s*$/gm;

  let match;
  while ((match = linePattern.exec(text)) !== null) {
    const description = match[1].trim();
    const qty = parseFloat(match[2]);
    const unitPrice = parseFloat(match[3].replace(/,/g, ''));
    const amount = parseFloat(match[4].replace(/,/g, ''));

    if (description && !isNaN(qty) && !isNaN(amount) && amount > 0) {
      items.push({ description, quantity: qty, unitPrice, amount });
    }
  }

  // If no tabular items found, look for description labels
  if (items.length === 0) {
    const descMatch = text.match(/(?:particulars|description|service|item|goods)[\s:]*([^\n]{5,100})/gi);
    if (descMatch && descMatch.length > 0) {
      items.push({ description: descMatch[0].replace(/^(?:particulars|description|service|item|goods)[\s:]*/i, '').trim() });
    }
  }

  return items.slice(0, 20); // limit to 20 items max
}

// ─────────────────────────────────────────────
// REMARKS
// ─────────────────────────────────────────────

function extractRemarks(text: string): string | undefined {
  const remarksMatch = text.match(/(?:remarks|notes|narration|description|subject)[\s:]*([^\n]{5,200})/i);
  if (remarksMatch) return remarksMatch[1].trim();
  return undefined;
}

// ─────────────────────────────────────────────
// DOCUMENT TYPE CLASSIFICATION
// ─────────────────────────────────────────────

export function classifyDocumentType(text: string): DocumentType {
  const lower = text.toLowerCase();

  if (/tax\s*invoice/.test(lower)) return 'TAX_INVOICE';
  if (/credit\s*note/.test(lower)) return 'CREDIT_NOTE';
  if (/debit\s*note/.test(lower)) return 'DEBIT_NOTE';

  // Transport / freight
  if (/(?:lr\s*no|lorry\s*receipt|consignment|truck|freight|transport|logistics|carrier|gc\s*no|bilty|builty)/i.test(text)) {
    return 'FREIGHT';
  }

  if (/service\s*invoice/.test(lower)) return 'SERVICE_INVOICE';
  if (/bill/.test(lower)) return 'BILL';

  return 'UNKNOWN';
}
