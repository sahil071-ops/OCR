// GET /api/masters/export - download master data as CSV

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const vendors = await prisma.vendor.findMany({
      include: { aliases: true },
      orderBy: { vendorCode: 'asc' },
    });

    const headers = [
      'vendorCode', 'vendorName', 'gstin', 'panNumber',
      'defaultGlAccount', 'defaultTaxCode', 'defaultTdsCode', 'defaultDistRule',
      'defaultItemType', 'defaultRemarks', 'placeOfSupply', 'aliases', 'active',
    ];

    const rows = vendors.map(v => [
      v.vendorCode,
      v.vendorName,
      v.gstin || '',
      v.panNumber || '',
      v.defaultGlAccount || '',
      v.defaultTaxCode || '',
      v.defaultTdsCode || '',
      v.defaultDistRule || '',
      v.defaultItemType || '',
      v.defaultRemarks || '',
      v.placeOfSupply || '',
      v.aliases.map((a: { alias: string }) => a.alias).join(','),
      v.active ? 'true' : 'false',
    ].map((cell: unknown) => `"${String(cell).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="vendor_master_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('[Masters Export]', error);
    return NextResponse.json({ success: false, error: 'Export failed' }, { status: 500 });
  }
}
