// GET /api/sessions/[sessionId] - get session with documents
// DELETE /api/sessions/[sessionId] - delete session

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  try {
    const session = await prisma.scanSession.findUnique({
      where: { id: sessionId },
      include: {
        documents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error('[Session GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  try {
    // Get documents to clean up files
    const session = await prisma.scanSession.findUnique({
      where: { id: sessionId },
      include: { documents: true },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    // Delete uploaded files from disk
    for (const doc of session.documents) {
      if (doc.filePath) {
        try {
          const fullPath = path.resolve(process.cwd(), doc.filePath.replace(/^\//, ''));
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } catch (fileErr) {
          console.warn('[Session DELETE] Could not delete file:', doc.filePath, fileErr);
        }
      }
    }

    // Mark session as deleted (soft delete for audit trail)
    await prisma.scanSession.update({
      where: { id: sessionId },
      data: { status: 'DELETED' },
    });

    return NextResponse.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    console.error('[Session DELETE]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete session' },
      { status: 500 }
    );
  }
}
