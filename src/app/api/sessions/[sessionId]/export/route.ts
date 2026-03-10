// POST /api/sessions/[sessionId]/export - generate Excel export

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { generateExcelExport, generateExportFilename } from '@/lib/export';
import type { Session, Document } from '@/types';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  try {
    const session = await prisma.scanSession.findUnique({
      where: { id: sessionId },
      include: {
        documents: {
          where: { status: { not: 'PENDING' } },
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

    if (session.documents.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No processed documents to export' },
        { status: 400 }
      );
    }

    const excelBuffer = await generateExcelExport(
      session as unknown as Session,
      session.documents as unknown as Document[]
    );

    const filename = generateExportFilename(session.name);

    // Mark session as exported
    await prisma.scanSession.update({
      where: { id: sessionId },
      data: { status: 'EXPORTED', exportedAt: new Date() },
    });

    return new NextResponse(excelBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': excelBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[Export POST]', error);
    return NextResponse.json(
      { success: false, error: 'Export failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
