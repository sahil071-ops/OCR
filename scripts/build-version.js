#!/usr/bin/env node
/**
 * Build Version Script
 *
 * Generates version string and updates .env.local with version info
 * Run this BEFORE building: node scripts/build-version.js
 *
 * Version format: v0.1.0-YYYYMMDD-HHMM
 * Example: v0.1.0-20260310-1430
 */

const fs = require('fs');
const path = require('path');

// Generate version
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hours = String(now.getHours()).padStart(2, '0');
const mins = String(now.getMinutes()).padStart(2, '0');

const version = `v0.1.0-${year}${month}${day}-${hours}${mins}`;
const buildTimestamp = now.toISOString();

console.log(`[build-version] Version: ${version}`);
console.log(`[build-version] Build timestamp: ${buildTimestamp}`);

// Read current .env.local if it exists
const envPath = path.join(__dirname, '..', '.env.local');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf-8');
  // Remove existing version lines
  envContent = envContent
    .split('\n')
    .filter(line => !line.startsWith('NEXT_PUBLIC_APP_VERSION=')
      && !line.startsWith('NEXT_PUBLIC_BUILD_TIMESTAMP=')
    )
    .join('\n')
    .trim();
} else {
  console.log('[build-version] No .env.local found - creating version fragment only');
  console.log('[build-version] Copy .env.example to .env.local and fill in your values!');
}

// Append version lines
const versionLines = `\n# Auto-generated version info (do not edit manually)
NEXT_PUBLIC_APP_VERSION="${version}"
NEXT_PUBLIC_BUILD_TIMESTAMP="${buildTimestamp}"
`;

fs.writeFileSync(envPath, (envContent + versionLines).trim() + '\n');

// Also update service worker cache version
const swPath = path.join(__dirname, '..', 'public', 'sw.js');
if (fs.existsSync(swPath)) {
  let swContent = fs.readFileSync(swPath, 'utf-8');
  swContent = swContent.replace(
    /const CACHE_VERSION = '.*?';/,
    `const CACHE_VERSION = '${version}';`
  );
  fs.writeFileSync(swPath, swContent);
  console.log(`[build-version] Updated service worker cache version`);
}

// Write to CHANGELOG.md
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
const entry = `\n## ${version} (${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN')})\n- Build deployed\n`;

if (fs.existsSync(changelogPath)) {
  const existing = fs.readFileSync(changelogPath, 'utf-8');
  const lines = existing.split('\n');
  // Insert after the first line (title)
  lines.splice(1, 0, entry);
  fs.writeFileSync(changelogPath, lines.join('\n'));
} else {
  fs.writeFileSync(changelogPath, `# Changelog\n${entry}`);
}

console.log('[build-version] Done!');
console.log(`[build-version] Set NEXT_PUBLIC_APP_VERSION=${version} in .env.local`);
