// 2-Lane Extraction Pipeline
//
// Lane A – Standard path (~95% of invoices, zero AI cost):
//   upload → OCR (PaddleOCR/pdf-native) → regex parse → vendor match
//   → validate → if passes: save as OCR_ONLY or PDF_NATIVE
//
// Lane B – Rescue path (~5% of invoices, AI used only here):
//   same OCR → if validation fails:
//     → try claude-haiku (cheap)  → validate again
//     → if still fails: try claude-sonnet (strong) → validate again
//     → save as AI_CHEAP or AI_STRONG
//
// Claude Vision (for images where OCR produced zero text) is also in Lane B.
//
// The key principle: Claude is the exception, not the default.

import prisma from '@/lib/db';
import { extractTextFromFile, extractWithClaudeVision } from '@/lib/extraction/textExtractor';
import { parseInvoiceFields } from '@/lib/extraction/fieldParser';
import { normalizeExtractedFields } from '@/lib/extraction/normalizer';
import { extractFieldsWithClaude } from '@/lib/extraction/claudeExtractor';
import { validateExtraction, validateAfterAi } from '@/lib/extraction/validation';
import { matchVendor, buildConfidenceData, calculateOverallConfidence } from '@/lib/matching';
import type { ProcessingLane } from '@/types';
import type { ExtractedFields } from '@/types';

export async function runExtractionPipeline(
  documentId: string,
  filePath: string,
  mimeType: string,
  originalName: string
) {
  try {
    console.log(`[Pipeline] Starting doc ${documentId}`);

    // ──────────────────────────────────────────────────────────
    // STEP 1: Extract raw text (pdf-native → PaddleOCR → Tesseract)
    // No Claude here – this is the cheap path for ALL documents.
    // ──────────────────────────────────────────────────────────
    const textResult = await extractTextFromFile(filePath, mimeType, originalName);
    let rawText = textResult.text || '';

    // ──────────────────────────────────────────────────────────
    // STEP 2: Regex field parsing
    // ──────────────────────────────────────────────────────────
    let fields: Partial<ExtractedFields> = normalizeExtractedFields(
      parseInvoiceFields(rawText, mimeType)
    );

    // ──────────────────────────────────────────────────────────
    // STEP 3: Validate – decide lane
    // ──────────────────────────────────────────────────────────
    const validation = validateExtraction(fields, textResult.ocrConfidence, rawText);

    // Track cost + lane across potential escalations
    let processingLane: ProcessingLane = textResult.method === 'pdf-native'
      ? 'PDF_NATIVE'
      : 'OCR_ONLY';
    let fallbackReason: string | null = null;
    let totalTokensUsed = 0;
    let totalCostUsd = 0;

    // ──────────────────────────────────────────────────────────
    // STEP 4A: Lane A – OCR result is good enough
    // ──────────────────────────────────────────────────────────
    if (validation.outcome === 'ACCEPT' || validation.outcome === 'ACCEPT_WARNING') {
      console.log(`[Pipeline] doc ${documentId} → Lane A (${processingLane})`);
      // Skip to vendor match + save
    }
    // ──────────────────────────────────────────────────────────
    // STEP 4B: Lane B – needs AI rescue
    // ──────────────────────────────────────────────────────────
    else {
      fallbackReason = validation.reasons.join('; ');
      console.log(`[Pipeline] doc ${documentId} → Lane B. Reason: ${fallbackReason}`);

      // Special case: OCR returned almost nothing → try Claude Vision first
      // to get actual text, then parse + validate as normal
      if (rawText.trim().length < 80 && process.env.ANTHROPIC_API_KEY) {
        console.log(`[Pipeline] doc ${documentId} – near-empty OCR, trying Claude Vision`);
        const visionResult = await extractWithClaudeVision(filePath, mimeType);
        if (visionResult.text && visionResult.text.trim().length > 50) {
          rawText = visionResult.text;
          fields = normalizeExtractedFields(parseInvoiceFields(rawText, mimeType));
        }
      }

      // Sub-step B1: Try claude-haiku (cheap rescue)
      if (validation.outcome !== 'NEEDS_AI_STRONG' && process.env.ANTHROPIC_API_KEY) {
        console.log(`[Pipeline] doc ${documentId} – trying haiku rescue`);
        const haikusResult = await extractFieldsWithClaude(rawText, 'haiku', fallbackReason);
        totalTokensUsed += haikusResult.tokensUsed;
        totalCostUsd    += haikusResult.estimatedCostUsd;

        if (!haikusResult.error) {
          // Merge haiku result over regex result (haiku wins for non-null values)
          fields = mergeFields(fields, haikusResult.fields);
          processingLane = 'AI_CHEAP';

          // Check if haiku result is now good enough
          const postHaikuValidation = validateAfterAi(fields, rawText);
          if (postHaikuValidation) {
            console.log(`[Pipeline] doc ${documentId} – haiku rescue succeeded`);
            // Done – skip sonnet
          } else {
            // Sub-step B2: Escalate to sonnet
            console.log(`[Pipeline] doc ${documentId} – haiku insufficient, escalating to sonnet`);
            await escalateToSonnet();
          }
        } else {
          console.warn(`[Pipeline] haiku failed (${haikusResult.error}), escalating`);
          await escalateToSonnet();
        }
      } else if (process.env.ANTHROPIC_API_KEY) {
        // NEEDS_AI_STRONG – skip haiku entirely
        await escalateToSonnet();
      }
      // If no API key: stay with OCR result, mark for manual review
    }

    // ──────────────────────────────────────────────────────────
    // STEP 5: Vendor matching
    // ──────────────────────────────────────────────────────────
    const matchResult = await matchVendor(fields.vendorName, fields.vendorGstin);
    const confidenceData = buildConfidenceData(fields as Record<string, unknown>, matchResult);
    const overallConfidence = calculateOverallConfidence(confidenceData);

    const vendorDefaults = matchResult.vendor
      ? {
          vendorId:         matchResult.vendor.id,
          vendorCode:       matchResult.vendor.vendorCode,
          glAccount:        matchResult.vendor.defaultGlAccount,
          taxCode:          matchResult.vendor.defaultTaxCode,
          tdsCode:          matchResult.vendor.defaultTdsCode,
          distributionRule: matchResult.vendor.defaultDistRule,
        }
      : {};

    // ──────────────────────────────────────────────────────────
    // STEP 6: Duplicate detection
    // ──────────────────────────────────────────────────────────
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

    // ──────────────────────────────────────────────────────────
    // STEP 7: Persist to DB
    // ──────────────────────────────────────────────────────────
    await prisma.extractedDocument.update({
      where: { id: documentId },
      data: {
        status: 'EXTRACTED',
        rawText,
        pageCount:        textResult.pageCount,
        documentType:     (fields.documentType || 'UNKNOWN') as
          'TAX_INVOICE' | 'SERVICE_INVOICE' | 'FREIGHT' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'BILL' | 'UNKNOWN',
        vendorName:       fields.vendorName,
        vendorGstin:      fields.vendorGstin,
        invoiceNumber:    fields.invoiceNumber,
        invoiceDate:      fields.invoiceDate,
        dueDate:          fields.dueDate,
        placeOfSupply:    fields.placeOfSupply,
        taxableAmount:    fields.taxableAmount,
        cgst:             fields.cgst,
        sgst:             fields.sgst,
        igst:             fields.igst,
        totalAmount:      fields.totalAmount,
        currency:         fields.currency || 'INR',
        lineItems:        (fields.lineItems as object[]) || [],
        remarks:          fields.remarks,
        ...vendorDefaults,
        confidenceData:   confidenceData as object,
        overallConfidence,
        isDuplicate,
        duplicateOfId,
        // Lane & cost tracking
        processingLane,
        fallbackReason,
        ocrConfidence:   textResult.ocrConfidence,
        ocrMethod:       textResult.method,
        aiTokensUsed:    totalTokensUsed > 0 ? totalTokensUsed : null,
        aiEstimatedCost: totalCostUsd    > 0 ? totalCostUsd    : null,
      },
    });

    console.log(
      `[Pipeline] doc ${documentId} done. Lane: ${processingLane} ` +
      `Confidence: ${overallConfidence} Tokens: ${totalTokensUsed} Cost: $${totalCostUsd.toFixed(5)}`
    );

    // ──────────────────────────────────────────────────────────
    // Sonnet escalation closure (has access to outer scope vars)
    // ──────────────────────────────────────────────────────────
    async function escalateToSonnet() {
      const sonnetResult = await extractFieldsWithClaude(rawText, 'sonnet', fallbackReason ?? undefined);
      totalTokensUsed += sonnetResult.tokensUsed;
      totalCostUsd    += sonnetResult.estimatedCostUsd;

      if (!sonnetResult.error) {
        fields = mergeFields(fields, sonnetResult.fields);
      }
      processingLane = 'AI_STRONG';
    }

  } catch (error) {
    console.error(`[Pipeline] Fatal error for doc ${documentId}:`, error);
    await prisma.extractedDocument.update({
      where: { id: documentId },
      data: {
        status: 'ERROR',
        processingError: error instanceof Error ? error.message : 'Unknown extraction error',
      },
    }).catch(e => console.error('[Pipeline] Failed to update error status:', e));
  }
}

// ─────────────────────────────────────────────
// Merge helper
// ─────────────────────────────────────────────

/**
 * Merge AI-extracted fields over OCR-extracted fields.
 * AI values win for any field where AI returned a non-null value.
 * This preserves good regex results where AI returned null.
 */
function mergeFields(
  base: Partial<ExtractedFields>,
  overlay: Partial<ExtractedFields>
): Partial<ExtractedFields> {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overlay).filter(([, v]) => v != null && v !== undefined)
    ),
  };
}
