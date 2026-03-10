#!/usr/bin/env node
/**
 * Session Cleanup Script
 *
 * Deletes expired sessions and their uploaded files
 * Should be run as a cron job: e.g., every hour
 *
 * Usage: node scripts/cleanup-sessions.js
 * Cron: 0 * * * * cd /app && node scripts/cleanup-sessions.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function cleanup() {
  console.log('[Cleanup] Starting session cleanup...', new Date().toISOString());

  try {
    // Find expired sessions
    const expiredSessions = await prisma.scanSession.findMany({
      where: {
        status: { not: 'DELETED' },
        expiresAt: { lt: new Date() },
      },
      include: { documents: true },
    });

    console.log(`[Cleanup] Found ${expiredSessions.length} expired sessions`);

    for (const session of expiredSessions) {
      console.log(`[Cleanup] Deleting session: ${session.name} (${session.id})`);

      // Delete files
      for (const doc of session.documents) {
        if (doc.filePath) {
          try {
            const fullPath = path.resolve(process.cwd(), doc.filePath.replace(/^\//, ''));
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              console.log(`[Cleanup] Deleted file: ${doc.filePath}`);
            }
          } catch (err) {
            console.warn(`[Cleanup] Could not delete file: ${doc.filePath}`, err.message);
          }
        }
      }

      // Clean up empty session upload directory
      const sessionDir = path.join(process.cwd(), 'uploads', session.id);
      if (fs.existsSync(sessionDir)) {
        try {
          fs.rmdirSync(sessionDir);
        } catch {
          // Directory not empty, ignore
        }
      }

      // Mark as deleted
      await prisma.scanSession.update({
        where: { id: session.id },
        data: { status: 'DELETED' },
      });
    }

    console.log('[Cleanup] Done!');
  } catch (err) {
    console.error('[Cleanup] Error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanup();
