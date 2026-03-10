// GET /api/masters/vendors - list all vendors
// POST /api/masters/vendors - create a vendor

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { invalidateVendorCache } from '@/lib/matching';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const where = search
      ? {
          OR: [
            { vendorName: { contains: search, mode: 'insensitive' as const } },
            { vendorCode: { contains: search, mode: 'insensitive' as const } },
            { gstin: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        include: { aliases: true },
        orderBy: { vendorName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.vendor.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: vendors,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error('[Vendors GET]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch vendors' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.vendorCode || !body.vendorName) {
      return NextResponse.json(
        { success: false, error: 'vendorCode and vendorName are required' },
        { status: 400 }
      );
    }

    // Check for duplicate vendor code
    const existing = await prisma.vendor.findUnique({
      where: { vendorCode: body.vendorCode },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Vendor code ${body.vendorCode} already exists` },
        { status: 409 }
      );
    }

    const vendor = await prisma.vendor.create({
      data: {
        vendorCode: body.vendorCode,
        vendorName: body.vendorName,
        gstin: body.gstin || null,
        panNumber: body.panNumber || null,
        defaultGlAccount: body.defaultGlAccount || null,
        defaultTaxCode: body.defaultTaxCode || null,
        defaultTdsCode: body.defaultTdsCode || null,
        defaultDistRule: body.defaultDistRule || null,
        defaultItemType: body.defaultItemType || null,
        defaultRemarks: body.defaultRemarks || null,
        placeOfSupply: body.placeOfSupply || null,
        active: body.active !== false,
      },
    });

    // Log the creation
    await prisma.masterAuditLog.create({
      data: {
        vendorId: vendor.id,
        action: 'CREATE',
        changeData: { after: vendor },
        source: 'manual-create',
      },
    });

    invalidateVendorCache();

    return NextResponse.json({ success: true, data: vendor }, { status: 201 });
  } catch (error) {
    console.error('[Vendors POST]', error);
    return NextResponse.json({ success: false, error: 'Failed to create vendor' }, { status: 500 });
  }
}
