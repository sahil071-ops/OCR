// POST /api/sessions/[sessionId]/process
// Starts extraction for all PENDING documents in a session (batch processing)

import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import prisma from '@/lib/db';
import { runExtractionPipeline } from '@/lib/extraction/pipeline';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  try {
    const pendingDocs = await prisma.extractedDocument.findMany({
      where: { sessionId, status: 'PENDING' },
    });

    if (pendingDocs.length === 0) {
      return NextResponse.json({ success: true, data: { started: 0 } });
    }

    // Mark all as PROCESSING before firing background tasks
    await prisma.extractedDocument.updateMany({
      where: { sessionId, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });

    // Fire extraction for each document in parallel (background)
    for (const doc of pendingDocs) {
      const absolutePath = path.join(process.cwd(), doc.filePath);
      runExtractionPipeline(doc.id, absolutePath, doc.fileType, doc.fileName)
        .catch(err => console.error(`[Process] Extraction failed for ${doc.id}:`, err));
    }

    return NextResponse.json({ success: true, data: { started: pendingDocs.length } });
  } catch (error) {
    console.error('[Process POST]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start processing' },
      { status: 500 }
    );
  }
}
