// GET /api/health - health check + version info

import { NextResponse } from 'next/server';
import { APP_VERSION, BUILD_TIMESTAMP, RELEASE_NOTES, APP_ENVIRONMENT } from '@/lib/version';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: APP_VERSION,
    buildTimestamp: BUILD_TIMESTAMP,
    releaseNotes: RELEASE_NOTES,
    environment: APP_ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
}
