import path from 'node:path';
import type { PrismaConfig } from 'prisma';

// Prisma 7 configuration
// Database adapter is configured in src/lib/db.ts at runtime
export default {
  schema: path.join(__dirname, 'schema.prisma'),
} satisfies PrismaConfig;
