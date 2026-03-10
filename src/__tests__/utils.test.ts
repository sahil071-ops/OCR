// Unit tests for utility functions

import {
  parseIndianDate,
  normalizeVendorName,
  isValidGSTIN,
  formatFileSize,
  sessionExpiry,
  stateFromGSTIN,
} from '../lib/utils';

describe('parseIndianDate', () => {
  it('should parse DD/MM/YYYY format', () => {
    expect(parseIndianDate('31/08/2024')).toBe('2024-08-31');
  });

  it('should parse DD-MM-YYYY format', () => {
    expect(parseIndianDate('31-08-2024')).toBe('2024-08-31');
  });

  it('should parse ISO date format', () => {
    expect(parseIndianDate('2024-08-31')).toBe('2024-08-31');
  });

  it('should parse DD-Mon-YYYY format', () => {
    const result = parseIndianDate('30-Jun-2024');
    expect(result).toBe('2024-06-30');
  });

  it('should return null for invalid date', () => {
    expect(parseIndianDate('not-a-date')).toBeNull();
  });

  it('should return null for empty input', () => {
    expect(parseIndianDate(null)).toBeNull();
    expect(parseIndianDate(undefined)).toBeNull();
    expect(parseIndianDate('')).toBeNull();
  });
});

describe('normalizeVendorName', () => {
  it('should lowercase and remove business suffixes', () => {
    const result = normalizeVendorName('DHL Express (India) Pvt. Ltd.');
    expect(result).not.toContain('pvt');
    expect(result).not.toContain('ltd');
  });

  it('should handle multiple spaces', () => {
    const result = normalizeVendorName('  Axis  Electrical  Components  ');
    expect(result).toBe('axis electrical components');
  });

  it('should make two similar names comparable', () => {
    const a = normalizeVendorName('BLR Logistiks (I) Ltd');
    const b = normalizeVendorName('BLR Logistiks India Limited');
    // Both should have "blr logistiks" after normalization
    expect(a).toContain('blr logistiks');
    expect(b).toContain('blr logistiks');
  });
});

describe('isValidGSTIN', () => {
  it('should validate a correct GSTIN', () => {
    expect(isValidGSTIN('27AABCD3611Q1ZI')).toBe(true);
    expect(isValidGSTIN('27AAACA9691C1ZN')).toBe(true);
    expect(isValidGSTIN('36APGPA5893Q2Z6')).toBe(true);
  });

  it('should reject invalid GSTINs', () => {
    expect(isValidGSTIN('INVALID')).toBe(false);
    expect(isValidGSTIN('')).toBe(false);
    expect(isValidGSTIN(null)).toBe(false);
    expect(isValidGSTIN('27AABCD361Q1ZI')).toBe(false); // Too short
  });

  it('should be case insensitive', () => {
    expect(isValidGSTIN('27aabcd3611q1zi')).toBe(true);
  });
});

describe('formatFileSize', () => {
  it('should format bytes correctly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
    expect(formatFileSize(20971520)).toBe('20 MB');
  });

  it('should handle fractional sizes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });
});

describe('sessionExpiry', () => {
  it('should return a date in the future', () => {
    const expiry = sessionExpiry(24);
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
  });

  it('should respect TTL hours', () => {
    const now = Date.now();
    const expiry1 = sessionExpiry(1);
    const expiry24 = sessionExpiry(24);
    const diff1 = expiry1.getTime() - now;
    const diff24 = expiry24.getTime() - now;
    // 24h should be ~24x longer than 1h
    expect(diff24 / diff1).toBeCloseTo(24, 0);
  });
});

describe('stateFromGSTIN', () => {
  it('should extract Maharashtra from 27XXXXX', () => {
    expect(stateFromGSTIN('27AABCD3611Q1ZI')).toBe('Maharashtra');
  });

  it('should extract Telangana from 36XXXXX', () => {
    expect(stateFromGSTIN('36APGPA5893Q2Z6')).toBe('Telangana');
  });

  it('should return null for invalid input', () => {
    expect(stateFromGSTIN(null)).toBeNull();
    expect(stateFromGSTIN('')).toBeNull();
  });
});
