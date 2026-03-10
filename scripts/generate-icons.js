#!/usr/bin/env node
/**
 * Icon Generator Script
 *
 * Generates PWA icons from an SVG template using sharp
 * Run: node scripts/generate-icons.js
 *
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Simple SVG icon for the app
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Background -->
  <rect width="512" height="512" rx="80" fill="#1E3A5F"/>
  <!-- Document shape -->
  <rect x="130" y="80" width="220" height="280" rx="15" fill="white" opacity="0.95"/>
  <!-- Lines on document -->
  <rect x="160" y="140" width="160" height="12" rx="6" fill="#1E3A5F" opacity="0.3"/>
  <rect x="160" y="170" width="120" height="10" rx="5" fill="#1E3A5F" opacity="0.2"/>
  <rect x="160" y="200" width="140" height="10" rx="5" fill="#1E3A5F" opacity="0.2"/>
  <rect x="160" y="230" width="100" height="10" rx="5" fill="#1E3A5F" opacity="0.2"/>
  <!-- Scan lines overlaid -->
  <rect x="140" y="260" width="200" height="3" fill="#3B82F6" opacity="0.8"/>
  <rect x="140" y="275" width="200" height="2" fill="#3B82F6" opacity="0.4"/>
  <rect x="140" y="285" width="200" height="2" fill="#3B82F6" opacity="0.4"/>
  <!-- Checkmark circle -->
  <circle cx="330" cy="330" r="70" fill="#10B981"/>
  <path d="M300 330 L320 350 L365 305" stroke="white" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

async function generateIcons() {
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const svgBuffer = Buffer.from(svgIcon);

  for (const size of sizes) {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon-${size}x${size}.png`);
  }

  console.log('All icons generated!');
}

generateIcons().catch(console.error);
