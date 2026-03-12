// Validation Engine + Lane Router
//
// After OCR + regex parsing, this module decides:
//   - Is the extracted data good enough? (Lane A: no AI needed)
//   - Does it need AI help? (Lane B: try haiku, escalate to sonnet if still bad)
//
// The thresholds are configurable via environment variables so you can
// tune without redeploying code.

import type { ExtractedFields } from '@/types';

// ─────────────────────────────────────────────
// Thresholds (override via env vars if needed)
// ─────────────────────────────────────────────

const OCR_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.OCR_CONFIDENCE_THRESHOLD || '0.65'
);
const OVERALL_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.OVERALL_CONFIDENCE_THRESHOLD || '0.60'
);
// How close subtotal+tax must be to total for math to "reconcile" (fractional)
const MATH_TOLERANCE = parseFloat(process.env.MATH_TOLERANCE || '0.05');

// ─────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────

export type ValidationOutcome =
  | 'ACCEPT'            // Good data, no AI needed  (Lane A)
  | 'ACCEPT_WARNING'    // Minor issues, flag for review but no AI  (Lane A)
  | 'NEEDS_AI_CHEAP'    // Try haiku  (Lane B entry)
  | 'NEEDS_AI_STRONG';  // Skip haiku, go straight to sonnet (very bad OCR)

export interface ValidationResult {
  outcome: ValidationOutcome;
  reasons: string[];         // human-readable list of issues found
  checks: ValidationChecks;  // individual check results for debugging
}

export interface ValidationChecks {
  hasInvoiceNumber: boolean;
  hasInvoiceDate: boolean;
  hasTotalAmount: boolean;
  mathReconciles: boolean | null;  // null = not enough data to check
  ocrConfidenceOk: boolean | null; // null = no OCR confidence available
  vendorExtracted: boolean;
  noSuspiciousText: boolean;
}

// ─────────────────────────────────────────────
// Main validation function
// ─────────────────────────────────────────────

export function validateExtraction(
  fields: ExtractedFields,
  ocrConfidence: number | null | undefined,
  rawText: string
): ValidationResult {
  const reasons: string[] = [];

  // ── Individual checks ──────────────────────────────────────

  const hasInvoiceNumber = !!fields.invoiceNumber && fields.invoiceNumber.length >= 2;
  const hasInvoiceDate = !!fields.invoiceDate;
  const hasTotalAmount = fields.totalAmount != null && fields.totalAmount > 0;
  const vendorExtracted = !!fields.vendorName || !!fields.vendorGstin;

  const mathReconciles = checkMathReconciliation(fields);
  const ocrConfidenceOk =
    ocrConfidence != null ? ocrConfidence >= OCR_CONFIDENCE_THRESHOLD : null;
  const noSuspiciousText = !hasSuspiciousPatterns(rawText);

  // ── Collect failure reasons ────────────────────────────────

  if (!hasInvoiceNumber) reasons.push('Missing invoice number');
  if (!hasInvoiceDate)   reasons.push('Missing invoice date');
  if (!hasTotalAmount)   reasons.push('Missing total amount');
  if (!vendorExtracted)  reasons.push('Vendor name and GSTIN both missing');
  if (mathReconciles === false) reasons.push('Amount totals do not reconcile');
  if (ocrConfidenceOk === false)
    reasons.push(`OCR confidence low (${((ocrConfidence ?? 0) * 100).toFixed(0)}%)`);
  if (!noSuspiciousText) reasons.push('Suspicious text patterns (possible messy scan)');

  // ── Determine outcome ──────────────────────────────────────

  const checks: ValidationChecks = {
    hasInvoiceNumber,
    hasInvoiceDate,
    hasTotalAmount,
    mathReconciles,
    ocrConfidenceOk,
    vendorExtracted,
    noSuspiciousText,
  };

  // Very bad OCR confidence → go straight to sonnet (skip haiku)
  if (ocrConfidence != null && ocrConfidence < 0.30) {
    return {
      outcome: 'NEEDS_AI_STRONG',
      reasons,
      checks,
    };
  }

  // No critical fields at all → likely a complete OCR failure
  const criticalMissing = !hasInvoiceNumber && !hasTotalAmount && !hasInvoiceDate;
  if (criticalMissing) {
    return {
      outcome: ocrConfidence != null && ocrConfidence < 0.50
        ? 'NEEDS_AI_STRONG'
        : 'NEEDS_AI_CHEAP',
      reasons,
      checks,
    };
  }

  // Some issues but not catastrophic → haiku rescue
  const hasIssues = reasons.length > 0;
  if (hasIssues) {
    return {
      outcome: 'NEEDS_AI_CHEAP',
      reasons,
      checks,
    };
  }

  // All good → Lane A
  return {
    outcome: reasons.length === 0 ? 'ACCEPT' : 'ACCEPT_WARNING',
    reasons,
    checks,
  };
}

/**
 * Validate AGAIN after an AI call.
 * Returns true if the result is now acceptable.
 */
export function validateAfterAi(
  fields: ExtractedFields,
  _rawText: string
): boolean {
  // After AI we only require the three most critical fields
  const hasInvoiceNumber = !!fields.invoiceNumber;
  const hasTotalAmount   = fields.totalAmount != null && fields.totalAmount > 0;
  const hasVendor        = !!fields.vendorName || !!fields.vendorGstin;

  return hasInvoiceNumber && hasTotalAmount && hasVendor;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function checkMathReconciliation(fields: ExtractedFields): boolean | null {
  const { taxableAmount, cgst, sgst, igst, totalAmount } = fields;

  if (totalAmount == null || totalAmount <= 0) return null;
  if (taxableAmount == null) return null;  // can't check without subtotal

  const taxSum = (cgst ?? 0) + (sgst ?? 0) + (igst ?? 0);
  const computed = taxableAmount + taxSum;
  const diff = Math.abs(computed - totalAmount);
  const tolerance = totalAmount * MATH_TOLERANCE;

  return diff <= tolerance;
}

function hasSuspiciousPatterns(text: string): boolean {
  // Very short text after OCR usually means poor quality scan
  if (text.trim().length < 80) return true;

  // High ratio of non-alphanumeric chars = OCR noise
  const nonAlpha = (text.match(/[^a-zA-Z0-9\s.,/\-:₹%]/g) || []).length;
  const total = text.length;
  if (total > 0 && nonAlpha / total > 0.25) return true;

  // Typical OCR garbage patterns
  if (/[^\x20-\x7E\n\r]{5,}/.test(text)) return true;  // long non-ASCII runs

  return false;
}

// ─────────────────────────────────────────────
// Cost estimation helpers
// ─────────────────────────────────────────────

// Approximate USD cost per 1M tokens (March 2025 pricing)
const HAIKU_INPUT_PER_M  = 0.80;
const HAIKU_OUTPUT_PER_M = 4.00;
const SONNET_INPUT_PER_M = 3.00;
const SONNET_OUTPUT_PER_M= 15.00;

export function estimateCost(
  model: 'haiku' | 'sonnet',
  inputTokens: number,
  outputTokens: number
): number {
  const rates =
    model === 'haiku'
      ? { in: HAIKU_INPUT_PER_M,  out: HAIKU_OUTPUT_PER_M }
      : { in: SONNET_INPUT_PER_M, out: SONNET_OUTPUT_PER_M };

  return (
    (inputTokens  / 1_000_000) * rates.in +
    (outputTokens / 1_000_000) * rates.out
  );
}
