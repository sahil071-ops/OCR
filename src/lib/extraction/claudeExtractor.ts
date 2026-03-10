// Claude-powered structured extraction
// Uses Claude to extract structured JSON from invoice text

import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedFields, LineItem, DocumentType } from '@/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const EXTRACTION_PROMPT = `You are an expert Indian invoice data extraction assistant.

Extract structured data from this invoice/document text. Return ONLY valid JSON matching this schema:

{
  "vendorName": "string or null",
  "vendorGstin": "string or null - must be valid GSTIN format",
  "invoiceNumber": "string or null",
  "invoiceDate": "string or null - in DD/MM/YYYY format if found",
  "dueDate": "string or null",
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
      "quantity": number or null,
      "unitPrice": number or null,
      "amount": number or null,
      "hsn": "string or null"
    }
  ],
  "remarks": "string or null"
}

Rules:
- Extract GSTIN as-is (15 character alphanumeric code starting with 2 digits)
- Amounts should be numbers without commas or currency symbols
- If a field is not found, use null
- For transport documents: use FREIGHT as documentType
- Extract the VENDOR/SELLER GSTIN, not the buyer's GSTIN
- Look for "From", "Seller", "Supplier", "Vendor" labels for vendor details
- The GSTIN near the top of the document is usually the vendor's GSTIN

Document text:
`;

/**
 * Extracts structured fields from raw text using Claude LLM
 * This provides much better accuracy than pure regex for complex documents
 */
export async function extractFieldsWithClaude(rawText: string): Promise<{
  fields: Partial<ExtractedFields>;
  error?: string;
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { fields: {}, error: 'No Claude API key configured' };
  }

  if (!rawText || rawText.trim().length < 20) {
    return { fields: {}, error: 'Insufficient text for extraction' };
  }

  try {
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: EXTRACTION_PROMPT + rawText.substring(0, 4000), // limit input tokens
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { fields: {}, error: 'Unexpected response type from Claude' };
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content.text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    const parsed = JSON.parse(jsonStr);

    // Convert to our ExtractedFields type
    const fields: Partial<ExtractedFields> = {
      vendorName: parsed.vendorName || undefined,
      vendorGstin: parsed.vendorGstin || undefined,
      invoiceNumber: parsed.invoiceNumber || undefined,
      invoiceDate: parsed.invoiceDate || undefined,
      dueDate: parsed.dueDate || undefined,
      placeOfSupply: parsed.placeOfSupply || undefined,
      taxableAmount: typeof parsed.taxableAmount === 'number' ? parsed.taxableAmount : undefined,
      cgst: typeof parsed.cgst === 'number' ? parsed.cgst : undefined,
      sgst: typeof parsed.sgst === 'number' ? parsed.sgst : undefined,
      igst: typeof parsed.igst === 'number' ? parsed.igst : undefined,
      totalAmount: typeof parsed.totalAmount === 'number' ? parsed.totalAmount : undefined,
      documentType: (parsed.documentType as DocumentType) || 'UNKNOWN',
      lineItems: Array.isArray(parsed.lineItems) ? parsed.lineItems as LineItem[] : undefined,
      remarks: parsed.remarks || undefined,
      currency: 'INR',
    };

    return { fields };
  } catch (err) {
    console.error('[ClaudeExtractor] Error:', err);
    return {
      fields: {},
      error: err instanceof Error ? err.message : 'Claude extraction failed',
    };
  }
}
