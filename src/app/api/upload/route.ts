// POST /api/upload - handles file upload and triggers extraction
// Accepts multipart/form-data with file + sessionId

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';

// Max file size: 20MB
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export async function POST(request: NextRequest) {
  let filePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sessionId = formData.get('sessionId') as string | null;

    // Validate inputs
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'No sessionId provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${file.type}. Allowed: PDF, JPEG, PNG, WebP, HEIC` },
        { status: 400 }
      );
    }

    // Validate session exists
    const session = await prisma.scanSession.findUnique({
      where: { id: sessionId, status: 'ACTIVE' },
    });
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found or not active' },
        { status: 404 }
      );
    }

    // Save file to disk
    const uploadsDir = path.join(process.cwd(), 'uploads', sessionId);
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const ext = path.extname(file.name) || '.bin';
    const savedFileName = `${uuidv4()}${ext}`;
    filePath = path.join(uploadsDir, savedFileName);
    const relativePath = `/uploads/${sessionId}/${savedFileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    // Create document record as PENDING — extraction starts when user taps "Process All"
    const doc = await prisma.extractedDocument.create({
      data: {
        sessionId,
        fileName: file.name,
        fileType: file.type,
        filePath: relativePath,
        fileSize: file.size,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        documentId: doc.id,
        fileName: file.name,
        status: 'pending',
        message: 'Upload successful, ready to process',
      },
    }, { status: 201 });

  } catch (error) {
    console.error('[Upload POST]', error);
    return NextResponse.json(
      { success: false, error: 'Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}

