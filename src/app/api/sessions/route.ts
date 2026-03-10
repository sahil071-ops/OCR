// GET /api/sessions - list all active sessions
// POST /api/sessions - create a new session

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { sessionExpiry } from '@/lib/utils';

export async function GET() {
  try {
    const sessions = await prisma.scanSession.findMany({
      where: {
        status: { not: 'DELETED' },
        expiresAt: { gt: new Date() }, // Only non-expired sessions
      },
      include: {
        _count: { select: { documents: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    console.error('[Sessions GET]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Session name is required' },
        { status: 400 }
      );
    }

    const ttlHours = parseInt(process.env.SESSION_TTL_HOURS || '24', 10);

    const session = await prisma.scanSession.create({
      data: {
        name: name.trim().substring(0, 100),
        expiresAt: sessionExpiry(ttlHours),
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (error) {
    console.error('[Sessions POST]', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
