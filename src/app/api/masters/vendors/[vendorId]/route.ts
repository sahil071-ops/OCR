// GET /api/masters/vendors/[vendorId] - get vendor
// PUT /api/masters/vendors/[vendorId] - update vendor
// DELETE /api/masters/vendors/[vendorId] - delete vendor

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { invalidateVendorCache } from '@/lib/matching';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  const { vendorId } = await params;
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      include: { aliases: true },
    });
    if (!vendor) {
      return NextResponse.json({ success: false, error: 'Vendor not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: vendor });
  } catch (error) {
    console.error('[Vendor GET]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch vendor' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  const { vendorId } = await params;
  try {
    const body = await request.json();

    const before = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!before) {
      return NextResponse.json({ success: false, error: 'Vendor not found' }, { status: 404 });
    }

    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        vendorName: body.vendorName ?? before.vendorName,
        gstin: body.gstin !== undefined ? body.gstin : before.gstin,
        panNumber: body.panNumber !== undefined ? body.panNumber : before.panNumber,
        defaultGlAccount: body.defaultGlAccount !== undefined ? body.defaultGlAccount : before.defaultGlAccount,
        defaultTaxCode: body.defaultTaxCode !== undefined ? body.defaultTaxCode : before.defaultTaxCode,
        defaultTdsCode: body.defaultTdsCode !== undefined ? body.defaultTdsCode : before.defaultTdsCode,
        defaultDistRule: body.defaultDistRule !== undefined ? body.defaultDistRule : before.defaultDistRule,
        defaultItemType: body.defaultItemType !== undefined ? body.defaultItemType : before.defaultItemType,
        defaultRemarks: body.defaultRemarks !== undefined ? body.defaultRemarks : before.defaultRemarks,
        placeOfSupply: body.placeOfSupply !== undefined ? body.placeOfSupply : before.placeOfSupply,
        active: body.active !== undefined ? body.active : before.active,
      },
    });

    await prisma.masterAuditLog.create({
      data: {
        vendorId,
        action: 'UPDATE',
        changeData: { before, after: updated },
        source: 'manual-edit',
      },
    });

    invalidateVendorCache();

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[Vendor PUT]', error);
    return NextResponse.json({ success: false, error: 'Failed to update vendor' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  const { vendorId } = await params;
  try {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      return NextResponse.json({ success: false, error: 'Vendor not found' }, { status: 404 });
    }

    // Soft delete
    await prisma.vendor.update({
      where: { id: vendorId },
      data: { active: false },
    });

    await prisma.masterAuditLog.create({
      data: {
        vendorId,
        action: 'DELETE',
        changeData: { before: vendor },
        source: 'manual-delete',
      },
    });

    invalidateVendorCache();

    return NextResponse.json({ success: true, message: 'Vendor deactivated' });
  } catch (error) {
    console.error('[Vendor DELETE]', error);
    return NextResponse.json({ success: false, error: 'Failed to delete vendor' }, { status: 500 });
  }
}
