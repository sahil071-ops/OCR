// GET /api/documents/[documentId] - get document details
// PATCH /api/documents/[documentId] - update document fields (review)
// DELETE /api/documents/[documentId] - delete a document

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  try {
    const doc = await prisma.extractedDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: doc });
  } catch (error) {
    console.error('[Document GET]', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch document' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  try {
    const body = await request.json();

    // Only allow updating specific fields (not system fields like filePath, sessionId)
    const allowedFields = [
      'vendorName', 'vendorGstin', 'vendorCode', 'vendorId',
      'invoiceNumber', 'invoiceDate', 'dueDate', 'postingDate',
      'placeOfSupply', 'taxableAmount', 'cgst', 'sgst', 'igst', 'totalAmount',
      'lineItems', 'remarks', 'documentType',
      'glAccount', 'taxCode', 'tdsCode', 'distributionRule',
      'projectCode', 'warehouse', 'grpoReference', 'itemCode',
      'rcmApplicable', 'downPayment', 'rounding',
      'status',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    // Mark as reviewed if status field isn't being explicitly set
    if (!updateData.status) {
      updateData.status = 'REVIEWED';
      updateData.reviewedAt = new Date();
    }

    const updated = await prisma.extractedDocument.update({
      where: { id: documentId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[Document PATCH]', error);
    return NextResponse.json({ success: false, error: 'Failed to update document' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  try {
    const doc = await prisma.extractedDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    // Delete file from disk
    if (doc.filePath) {
      try {
        const fullPath = path.resolve(process.cwd(), doc.filePath.replace(/^\//, ''));
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Non-fatal
      }
    }

    await prisma.extractedDocument.delete({ where: { id: documentId } });

    return NextResponse.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('[Document DELETE]', error);
    return NextResponse.json({ success: false, error: 'Failed to delete document' }, { status: 500 });
  }
}
