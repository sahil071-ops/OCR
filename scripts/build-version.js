#!/usr/bin/env node
/**
 * Build Version Script
 *
 * Generates a version string based on the current date/time.
 *
 * LOCAL DEV: writes version into .env.local so Next.js picks it up
 * RAILWAY / CI: skips .env.local (Railway env vars are set in the dashboard)
 *               just prints the version and updates the service worker
 *
 * Version format: v0.1.0-YYYYMMDD-HHMM
 */

const fs = require('fs');
const path = require('path');

// Detect Railway / CI environment
const isCI = process.env.RAILWAY_ENVIRONMENT
  || process.env.CI
  || process.env.RAILWAY_PROJECT_ID;

// Generate version string
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hours = String(now.getHours()).padStart(2, '0');
const mins = String(now.getMinutes()).padStart(2, '0');

const version = `v0.1.0-${year}${month}${day}-${hours}${mins}`;
const buildTimestamp = now.toISOString();

console.log(`[build-version] Version: ${version}`);
console.log(`[build-version] Timestamp: ${buildTimestamp}`);
console.log(`[build-version] CI/Railway mode: ${isCI ? 'YES' : 'NO'}`);

// Write version to .build-meta.json so next.config.ts can inject it via
// the env config (which overrides Railway dashboard variables at compile time)
const metaPath = path.join(__dirname, '..', '.build-meta.json');
try {
  fs.writeFileSync(metaPath, JSON.stringify({ version, buildTimestamp }, null, 2));
  console.log('[build-version] Wrote .build-meta.json');
} catch (e) {
  console.warn('[build-version] Could not write .build-meta.json:', e.message);
}

// Always write version into .env.local so next build picks up NEXT_PUBLIC_* vars
// Works in both local dev and Railway CI (Railway build has writable filesystem)
{
  const envPath = path.join(__dirname, '..', '.env.local');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
    envContent = envContent
      .split('\n')
      .filter(line =>
        !line.startsWith('NEXT_PUBLIC_APP_VERSION=') &&
        !line.startsWith('NEXT_PUBLIC_BUILD_TIMESTAMP=')
      )
      .join('\n')
      .trim();
  }

  const versionLines = `\n# Auto-generated - do not edit manually\nNEXT_PUBLIC_APP_VERSION="${version}"\nNEXT_PUBLIC_BUILD_TIMESTAMP="${buildTimestamp}"\n`;
  try {
    fs.writeFileSync(envPath, (envContent + versionLines).trim() + '\n');
    console.log('[build-version] Updated .env.local with version info');
  } catch (e) {
    console.warn('[build-version] Could not write .env.local:', e.message);
  }
}

// Always update service worker cache version (works in both local + CI)
const swPath = path.join(__dirname, '..', 'public', 'sw.js');
if (fs.existsSync(swPath)) {
  try {
    let swContent = fs.readFileSync(swPath, 'utf-8');
    swContent = swContent.replace(
      /const CACHE_VERSION = '.*?';/,
      `const CACHE_VERSION = '${version}';`
    );
    fs.writeFileSync(swPath, swContent);
    console.log('[build-version] Updated service worker cache version');
  } catch (e) {
    console.warn('[build-version] Could not update sw.js:', e.message);
  }
}

// LOCAL ONLY: append to CHANGELOG.md (skip in CI to avoid dirty git state)
if (!isCI) {
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  const entry = `\n## ${version} (${now.toLocaleDateString('en-IN')} ${now.toLocaleTimeString('en-IN')})\n- Build deployed\n`;
  try {
    if (fs.existsSync(changelogPath)) {
      const existing = fs.readFileSync(changelogPath, 'utf-8');
      const lines = existing.split('\n');
      lines.splice(1, 0, entry);
      fs.writeFileSync(changelogPath, lines.join('\n'));
    } else {
      fs.writeFileSync(changelogPath, `# Changelog\n${entry}`);
    }
  } catch (e) {
    console.warn('[build-version] Could not update CHANGELOG.md:', e.message);
  }
}

console.log('[build-version] Done!');
