// General utility functions shared across the app

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes safely, resolving conflicts
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a human-readable file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Parses various date string formats found on Indian invoices
 * Returns ISO date string or null if unparseable
 */
export function parseIndianDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  const cleaned = dateStr.trim();

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmy = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }

  // Try YYYY-MM-DD (already ISO)
  const iso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return cleaned;

  // Try DD-Mon-YYYY (e.g., 31-Aug-2024)
  const dMonY = cleaned.match(/^(\d{1,2})[\/\-]([A-Za-z]{3,})[\/\-](\d{4})$/);
  if (dMonY) {
    const [, d, m, y] = dMonY;
    const date = new Date(`${m} ${d}, ${y}`);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }

  // Try DD Mon YYYY (with space)
  const dSpaceMonY = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (dSpaceMonY) {
    const [, d, m, y] = dSpaceMonY;
    const date = new Date(`${m} ${d}, ${y}`);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Formats a date string for display
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Formats a number as Indian currency
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Returns a confidence color class based on score 0-1
 */
export function confidenceColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-400';
  if (score >= 0.85) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Returns a confidence badge background color
 */
export function confidenceBg(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-100 text-gray-600';
  if (score >= 0.85) return 'bg-green-100 text-green-700';
  if (score >= 0.6) return 'bg-yellow-100 text-yellow-700';
  return 'bg-red-100 text-red-700';
}

/**
 * Truncates text to a max length with ellipsis
 */
export function truncate(text: string | null | undefined, maxLen = 50): string {
  if (!text) return '-';
  return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
}

/**
 * Generates a session expiry time based on TTL hours
 */
export function sessionExpiry(ttlHours = 24): Date {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + ttlHours);
  return expiry;
}

/**
 * Normalizes a vendor name for matching
 * Removes common suffixes, lowercases, trims
 */
export function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|ltd|llp|private|limited|inc|corp|co|and|&)\b\.?/gi, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validates a GSTIN format
 */
export function isValidGSTIN(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(gstin.toUpperCase());
}

/**
 * Generates a build version string
 */
export function generateVersion(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  return `v0.1.0-${year}${month}${day}-${hours}${mins}`;
}

/**
 * Extracts plain state code from GSTIN (first 2 digits)
 */
export function stateFromGSTIN(gstin: string | null | undefined): string | null {
  if (!gstin || gstin.length < 2) return null;
  const stateCode = parseInt(gstin.substring(0, 2), 10);
  const stateCodes: Record<number, string> = {
    1: 'Jammu & Kashmir', 2: 'Himachal Pradesh', 3: 'Punjab',
    4: 'Chandigarh', 5: 'Uttarakhand', 6: 'Haryana', 7: 'Delhi',
    8: 'Rajasthan', 9: 'Uttar Pradesh', 10: 'Bihar', 11: 'Sikkim',
    12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur',
    15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam',
    19: 'West Bengal', 20: 'Jharkhand', 21: 'Odisha',
    22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat',
    25: 'Daman & Diu', 26: 'Dadra & NH', 27: 'Maharashtra',
    28: 'Andhra Pradesh', 29: 'Karnataka', 30: 'Goa', 31: 'Lakshadweep',
    32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry',
    35: 'Andaman & Nicobar', 36: 'Telangana', 37: 'Andhra Pradesh (new)',
  };
  return stateCodes[stateCode] ?? null;
}

/**
 * Sleep utility for retry logic
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
