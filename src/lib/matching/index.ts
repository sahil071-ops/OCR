// Vendor matching pipeline
// Tries GSTIN → exact name → alias → fuzzy name match
// Returns match result with confidence score

import Fuse from 'fuse.js';
import prisma from '@/lib/db';
import { normalizeVendorName } from '@/lib/utils';
import type { MatchResult, Vendor, ConfidenceData } from '@/types';

/**
 * Attempts to match a vendor from extracted document data
 * Returns matched vendor + confidence info
 */
export async function matchVendor(
  vendorName: string | null | undefined,
  gstin: string | null | undefined
): Promise<MatchResult> {
  const vendors = await getAllActiveVendors();

  // 1. Exact GSTIN match (most reliable)
  if (gstin) {
    const gstinMatch = vendors.find(v =>
      v.gstin?.toUpperCase() === gstin.toUpperCase()
    );
    if (gstinMatch) {
      return {
        vendor: gstinMatch as Vendor,
        method: 'exact-gstin',
        confidence: 0.98,
      };
    }
  }

  if (!vendorName) {
    return { vendor: null, method: 'none', confidence: 0 };
  }

  // 2. Exact vendor name match
  const exactNameMatch = vendors.find(v =>
    v.vendorName.toLowerCase() === vendorName.toLowerCase()
  );
  if (exactNameMatch) {
    return {
      vendor: exactNameMatch as Vendor,
      method: 'exact-name',
      confidence: 0.95,
    };
  }

  // 3. Vendor alias match
  type AliasRow = { id: string; vendorId: string; alias: string };
  const allAliases: AliasRow[] = await getVendorAliases();
  const aliasMatch = allAliases.find((a: AliasRow) =>
    a.alias.toLowerCase() === vendorName.toLowerCase()
  );
  if (aliasMatch) {
    const vendor = vendors.find(v => v.id === aliasMatch.vendorId);
    if (vendor) {
      return {
        vendor: vendor as Vendor,
        method: 'alias',
        confidence: 0.9,
      };
    }
  }

  // 4. Fuzzy name match using Fuse.js
  const normalizedInput = normalizeVendorName(vendorName);

  // Build list of searchable names (vendor names + aliases)
  const searchList: Array<{ id: string; name: string; vendorId: string }> = [
    ...vendors.map(v => ({
      id: v.id,
      name: normalizeVendorName(v.vendorName),
      vendorId: v.id,
    })),
    ...allAliases.map((a: AliasRow) => ({
      id: a.id,
      name: normalizeVendorName(a.alias),
      vendorId: a.vendorId,
    })),
  ];

  const fuse = new Fuse(searchList, {
    keys: ['name'],
    threshold: 0.4, // 0 = perfect match, 1 = match anything
    includeScore: true,
  });

  const results = fuse.search(normalizedInput);

  if (results.length > 0 && results[0].score !== undefined) {
    const bestMatch = results[0];
    const confidence = 1 - (bestMatch.score || 0); // Fuse score is 0=perfect, convert to 0-1

    if (confidence > 0.6) {
      const vendor = vendors.find(v => v.id === bestMatch.item.vendorId);
      if (vendor) {
        return {
          vendor: vendor as Vendor,
          method: 'fuzzy',
          confidence: Math.round(confidence * 100) / 100,
        };
      }
    }
  }

  return { vendor: null, method: 'none', confidence: 0 };
}

/**
 * Builds confidence data for a matched document
 */
export function buildConfidenceData(
  extractedFields: Record<string, unknown>,
  matchResult: MatchResult
): ConfidenceData {
  const data: ConfidenceData = {};

  // Vendor confidence
  if (matchResult.vendor) {
    data.vendorCode = {
      score: matchResult.confidence,
      source: 'master',
      method: matchResult.method,
    };
    data.vendorName = {
      score: matchResult.confidence,
      source: 'master',
      method: matchResult.method,
    };
  }

  // Extraction confidence for key fields
  const fieldScores: Record<string, number> = {
    vendorGstin: extractedFields.vendorGstin ? 0.9 : 0,
    invoiceNumber: extractedFields.invoiceNumber ? 0.85 : 0,
    invoiceDate: extractedFields.invoiceDate ? 0.85 : 0,
    totalAmount: extractedFields.totalAmount ? 0.8 : 0,
    taxableAmount: extractedFields.taxableAmount ? 0.75 : 0,
    placeOfSupply: extractedFields.placeOfSupply ? 0.8 : 0,
  };

  for (const [field, score] of Object.entries(fieldScores)) {
    if (score > 0) {
      data[field] = { score, source: 'extraction', method: 'regex-parse' };
    }
  }

  // Master-filled fields get confidence from the match
  if (matchResult.vendor) {
    const masterFields = ['glAccount', 'taxCode', 'tdsCode', 'distributionRule'];
    for (const field of masterFields) {
      const vendorKey = `default${field.charAt(0).toUpperCase() + field.slice(1)}` as keyof typeof matchResult.vendor;
      if (matchResult.vendor[vendorKey]) {
        data[field] = {
          score: matchResult.confidence * 0.9,
          source: 'master',
          method: `vendor-default-${matchResult.method}`,
        };
      }
    }
  }

  return data;
}

/**
 * Calculates overall document confidence score
 */
export function calculateOverallConfidence(confidenceData: ConfidenceData): number {
  const scores = Object.values(confidenceData).map(f => f.score);
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
}

// ─────────────────────────────────────────────
// DATA FETCHING HELPERS
// ─────────────────────────────────────────────

let vendorCache: Array<{
  id: string;
  vendorCode: string;
  vendorName: string;
  gstin: string | null;
  panNumber: string | null;
  defaultGlAccount: string | null;
  defaultTaxCode: string | null;
  defaultTdsCode: string | null;
  defaultDistRule: string | null;
  defaultItemType: string | null;
  defaultRemarks: string | null;
  placeOfSupply: string | null;
  active: boolean;
}> = [];
let vendorCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getAllActiveVendors() {
  if (Date.now() - vendorCacheTime < CACHE_TTL_MS && vendorCache.length > 0) {
    return vendorCache;
  }

  vendorCache = await prisma.vendor.findMany({
    where: { active: true },
    select: {
      id: true,
      vendorCode: true,
      vendorName: true,
      gstin: true,
      panNumber: true,
      defaultGlAccount: true,
      defaultTaxCode: true,
      defaultTdsCode: true,
      defaultDistRule: true,
      defaultItemType: true,
      defaultRemarks: true,
      placeOfSupply: true,
      active: true,
    },
  });
  vendorCacheTime = Date.now();
  return vendorCache;
}

async function getVendorAliases() {
  return prisma.vendorAlias.findMany({
    select: { id: true, vendorId: true, alias: true },
  });
}

// Invalidate cache when masters are updated
export function invalidateVendorCache() {
  vendorCache = [];
  vendorCacheTime = 0;
}
