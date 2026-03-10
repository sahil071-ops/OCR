// POST /api/masters/import - bulk import vendors from CSV/XLSX

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { invalidateVendorCache } from '@/lib/matching';

interface VendorRow {
  vendorCode?: string;
  vendorName?: string;
  gstin?: string;
  panNumber?: string;
  defaultGlAccount?: string;
  defaultTaxCode?: string;
  defaultTdsCode?: string;
  defaultDistRule?: string;
  defaultItemType?: string;
  defaultRemarks?: string;
  placeOfSupply?: string;
  aliases?: string; // comma-separated
  active?: string;
}

/**
 * Handles CSV/XLSX bulk import of vendor master data
 * Parses the file, upserts vendors, logs changes
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = formData.get('mode') as string || 'upsert'; // 'upsert' or 'replace'

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      return NextResponse.json(
        { success: false, error: 'Only CSV and XLSX files are supported' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let rows: VendorRow[] = [];

    if (ext === 'csv') {
      rows = parseCSV(buffer.toString('utf-8'));
    } else {
      // XLSX parsing
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        return NextResponse.json({ success: false, error: 'No worksheet found in XLSX' }, { status: 400 });
      }
      rows = parseXLSX(sheet);
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'No data rows found in file' }, { status: 400 });
    }

    // Validate required fields
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].vendorCode) errors.push(`Row ${i + 2}: vendorCode is required`);
      if (!rows[i].vendorName) errors.push(`Row ${i + 2}: vendorName is required`);
    }
    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: 'Validation errors', details: errors }, { status: 400 });
    }

    // Process imports
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.vendorCode || !row.vendorName) {
        skipped++;
        continue;
      }

      try {
        const existing = await prisma.vendor.findUnique({
          where: { vendorCode: row.vendorCode },
        });

        const vendorData = {
          vendorName: row.vendorName,
          gstin: row.gstin || null,
          panNumber: row.panNumber || null,
          defaultGlAccount: row.defaultGlAccount || null,
          defaultTaxCode: row.defaultTaxCode || null,
          defaultTdsCode: row.defaultTdsCode || null,
          defaultDistRule: row.defaultDistRule || null,
          defaultItemType: row.defaultItemType || null,
          defaultRemarks: row.defaultRemarks || null,
          placeOfSupply: row.placeOfSupply || null,
          active: row.active?.toLowerCase() !== 'false',
        };

        let vendor;
        if (existing) {
          vendor = await prisma.vendor.update({
            where: { vendorCode: row.vendorCode },
            data: vendorData,
          });
          updated++;
        } else {
          vendor = await prisma.vendor.create({
            data: { vendorCode: row.vendorCode, ...vendorData },
          });
          created++;
        }

        // Handle aliases
        if (row.aliases) {
          const aliasList = row.aliases.split(',').map((a: string) => a.trim()).filter(Boolean);
          for (const alias of aliasList) {
            await prisma.vendorAlias.upsert({
              where: { vendorId_alias: { vendorId: vendor.id, alias } },
              create: { vendorId: vendor.id, alias },
              update: {},
            });
          }
        }
      } catch (rowErr) {
        console.warn(`[Import] Skipped row ${row.vendorCode}:`, rowErr);
        skipped++;
      }
    }

    // Log the import
    await prisma.masterAuditLog.create({
      data: {
        action: 'IMPORT',
        changeData: { created, updated, skipped, filename: file.name },
        source: 'csv-import',
      },
    });

    invalidateVendorCache();

    return NextResponse.json({
      success: true,
      message: `Import complete: ${created} created, ${updated} updated, ${skipped} skipped`,
      data: { created, updated, skipped },
    });
  } catch (error) {
    console.error('[Import POST]', error);
    return NextResponse.json(
      { success: false, error: 'Import failed: ' + (error instanceof Error ? error.message : 'Unknown') },
      { status: 500 }
    );
  }
}

/**
 * Parse CSV text into row objects
 * Handles quoted fields and comma-separated values
 */
function parseCSV(text: string): VendorRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const header = parseCSVLine(lines[0]).map(h =>
    h.trim().toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '')
  );

  const rows: VendorRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = values[idx]?.trim() || '';
    });
    rows.push(normalizeRowKeys(row));
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let current = '';

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseXLSX(sheet: import('exceljs').Worksheet): VendorRow[] {
  const rows: VendorRow[] = [];
  const headerRow = sheet.getRow(1);
  const header: string[] = [];

  headerRow.eachCell((cell, colNumber) => {
    const val = cell.value?.toString().trim().toLowerCase()
      .replace(/\s+/g, '').replace(/[^a-z0-9]/g, '') || '';
    header[colNumber] = val;
  });

  sheet.eachRow((row, rowIndex) => {
    if (rowIndex === 1) return; // Skip header
    const rowData: Record<string, string> = {};
    row.eachCell((cell, colNumber) => {
      const key = header[colNumber];
      if (key) rowData[key] = cell.value?.toString().trim() || '';
    });
    if (Object.keys(rowData).length > 0) {
      rows.push(normalizeRowKeys(rowData));
    }
  });

  return rows;
}

/**
 * Maps various column name formats to our standard keys
 */
function normalizeRowKeys(row: Record<string, string>): VendorRow {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = row[k] || row[k.toLowerCase()] || row[k.replace(/[^a-z0-9]/gi, '').toLowerCase()];
      if (v) return v;
    }
    return undefined;
  };

  return {
    vendorCode: get('vendorcode', 'vendor_code', 'code', 'vendorcd'),
    vendorName: get('vendorname', 'vendor_name', 'name', 'vendornm'),
    gstin: get('gstin', 'gst', 'gstnumber', 'gstin_no'),
    panNumber: get('pannumber', 'pan', 'pan_no'),
    defaultGlAccount: get('defaultglaccount', 'glaccount', 'gl_account', 'glacc'),
    defaultTaxCode: get('defaulttaxcode', 'taxcode', 'tax_code'),
    defaultTdsCode: get('defaulttdscode', 'tdscode', 'tds_code'),
    defaultDistRule: get('defaultdistrule', 'distrule', 'distribution_rule', 'costcenter'),
    defaultItemType: get('defaultitemtype', 'itemtype', 'item_type'),
    defaultRemarks: get('defaultremarks', 'remarks', 'notes'),
    placeOfSupply: get('placeofsupply', 'pos', 'place_of_supply'),
    aliases: get('aliases', 'alias', 'alternate_names'),
    active: get('active', 'status'),
  };
}
