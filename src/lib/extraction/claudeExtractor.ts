// Claude-powered structured extraction – RESCUE LANE ONLY
//
// This module is ONLY called when OCR + regex failed to produce
// acceptable data. It is NOT the default path.
//
// Model selection strategy:
//   1. claude-haiku-4-5  (cheap)  – tried first for most rescues
//   2. claude-sonnet-4-6 (strong) – only if haiku result still fails validation
//
// Prompt caching is used on the long system prompt to reduce input token cost.
// Token usage and estimated cost are returned for every call.

import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedFields, LineItem, DocumentType } from '@/types';
import { estimateCost } from './validation';

// ─────────────────────────────────────────────
// Models
// ─────────────────────────────────────────────

export const HAIKU_MODEL   = 'claude-haiku-4-5-20251001';
export const SONNET_MODEL  = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// ─────────────────────────────────────────────
// Prompt (cached for cost reduction)
// ─────────────────────────────────────────────

// This prompt is marked for caching. Anthropic caches prompts longer than
// ~1024 tokens. By placing the schema + rules in the system prompt and the
// actual document text in the user message, we avoid re-paying for the
// system prompt on repeated calls.

const SYSTEM_PROMPT = `You are an expert Indian invoice data extraction assistant.

Extract structured data from the invoice text provided by the user.
Return ONLY valid JSON matching this exact schema (no markdown, no explanation):

{
  "vendorName": "string or null",
  "vendorGstin": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "string or null - DD/MM/YYYY format",
  "dueDate": "string or null - DD/MM/YYYY format",
  "placeOfSupply": "string or null - state name",
  "taxableAmount": number or null,
  "cgst": number or null,
  "sgst": number or null,
  "igst": number or null,
  "totalAmount": number or null,
  "documentType": "TAX_INVOICE" | "SERVICE_INVOICE" | "FREIGHT" | "CREDIT_NOTE" | "DEBIT_NOTE" | "BILL" | "UNKNOWN",
  "lineItems": [
    {
      "description": "string",
      "hsn": "string or null",
      "quantity": number or null,
      "unitPrice": number or null,
      "amount": number or null
    }
  ],
  "remarks": "string or null"
}

Rules:
- GSTIN must be exactly 15 characters (2 digits + 5 alpha + 4 digits + alpha + alphanumeric + Z + alphanumeric)
- Extract the VENDOR/SELLER GSTIN, not the buyer GSTIN
- Amounts: numbers only, no commas or currency symbols
- Dates: DD/MM/YYYY format only
- If a field is not found, use null
- For transport/logistics documents use FREIGHT as documentType
- lineItems: extract all line items you can find; empty array if none`;

// ─────────────────────────────────────────────
// Return types
// ─────────────────────────────────────────────

export interface ClaudeExtractionResult {
  fields: Partial<ExtractedFields>;
  tokensUsed: number;
  estimatedCostUsd: number;
  model: string;
  error?: string;
}

// ─────────────────────────────────────────────
// Main extraction function
// ─────────────────────────────────────────────

/**
 * Extract structured invoice fields from raw text using Claude.
 * @param rawText   The OCR/pdf-parse text of the document
 * @param model     Which model to use ('haiku' or 'sonnet')
 * @param context   Optional extra context (e.g. "amounts don't reconcile")
 */
export async function extractFieldsWithClaude(
  rawText: string,
  model: 'haiku' | 'sonnet' = 'haiku',
  context?: string
): Promise<ClaudeExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      fields: {},
      tokensUsed: 0,
      estimatedCostUsd: 0,
      model: model === 'haiku' ? HAIKU_MODEL : SONNET_MODEL,
      error: 'No Anthropic API key configured',
    };
  }

  if (!rawText || rawText.trim().length < 10) {
    return {
      fields: {},
      tokensUsed: 0,
      estimatedCostUsd: 0,
      model: model === 'haiku' ? HAIKU_MODEL : SONNET_MODEL,
      error: 'Insufficient text for extraction',
    };
  }

  const modelId = model === 'haiku' ? HAIKU_MODEL : SONNET_MODEL;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Limit input to stay within a sensible token budget
  const textToSend = rawText.substring(0, 5000);

  const userMessage = context
    ? `Context: ${context}\n\nDocument text:\n${textToSend}`
    : `Document text:\n${textToSend}`;

  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 1500,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Prompt caching: the large system prompt is cached after the first
          // call with the same content. This cuts input token cost by ~90%.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: 'ephemeral' } as any,
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return {
        fields: {},
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        estimatedCostUsd: estimateCost(model, response.usage.input_tokens, response.usage.output_tokens),
        model: modelId,
        error: 'Unexpected response type',
      };
    }

    const fields = parseClaudeJson(content.text);
    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;

    return {
      fields,
      tokensUsed: totalTokens,
      estimatedCostUsd: estimateCost(model, response.usage.input_tokens, response.usage.output_tokens),
      model: modelId,
    };

  } catch (err) {
    console.error(`[ClaudeExtractor] ${modelId} failed:`, err);
    return {
      fields: {},
      tokensUsed: 0,
      estimatedCostUsd: 0,
      model: modelId,
      error: err instanceof Error ? err.message : 'Claude extraction failed',
    };
  }
}

// ─────────────────────────────────────────────
// JSON parsing helper
// ─────────────────────────────────────────────

function parseClaudeJson(responseText: string): Partial<ExtractedFields> {
  let jsonStr = responseText.trim();

  // Strip markdown code fences if present
  const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenced) jsonStr = fenced[1];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.warn('[ClaudeExtractor] Failed to parse JSON response:', jsonStr.substring(0, 200));
    return {};
  }

  return {
    vendorName:    parsed.vendorName    as string | undefined || undefined,
    vendorGstin:   parsed.vendorGstin   as string | undefined || undefined,
    invoiceNumber: parsed.invoiceNumber as string | undefined || undefined,
    invoiceDate:   parsed.invoiceDate   as string | undefined || undefined,
    dueDate:       parsed.dueDate       as string | undefined || undefined,
    placeOfSupply: parsed.placeOfSupply as string | undefined || undefined,
    taxableAmount: typeof parsed.taxableAmount === 'number' ? parsed.taxableAmount : undefined,
    cgst:          typeof parsed.cgst          === 'number' ? parsed.cgst          : undefined,
    sgst:          typeof parsed.sgst          === 'number' ? parsed.sgst          : undefined,
    igst:          typeof parsed.igst          === 'number' ? parsed.igst          : undefined,
    totalAmount:   typeof parsed.totalAmount   === 'number' ? parsed.totalAmount   : undefined,
    documentType:  (parsed.documentType as DocumentType) || 'UNKNOWN',
    lineItems:     Array.isArray(parsed.lineItems) ? parsed.lineItems as LineItem[] : undefined,
    remarks:       parsed.remarks as string | undefined || undefined,
    currency:      'INR',
  };
}
