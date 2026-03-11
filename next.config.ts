import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Read version baked in by scripts/build-version.js at build time.
// Using next.config env overrides Railway dashboard variables at webpack compile time.
let buildVersion = "v0.1.0-dev";
let buildTimestamp = new Date().toISOString();
try {
  const meta = JSON.parse(
    fs.readFileSync(path.join(__dirname, ".build-meta.json"), "utf-8")
  );
  buildVersion = meta.version;
  buildTimestamp = meta.buildTimestamp;
} catch {
  // .build-meta.json not present (e.g. running next dev without build script)
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: buildVersion,
    NEXT_PUBLIC_BUILD_TIMESTAMP: buildTimestamp,
  },
  // Skip type checking during build (speeds up build, avoids worker crashes)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Enable serverExternalPackages for packages that use native node modules
  // canvas is included because pdf-parse pulls it in as an optional dep
  serverExternalPackages: ['tesseract.js', 'sharp', 'pdf-parse', 'canvas'],

  // Image configuration
  images: {
    remotePatterns: [],
  },

  // Headers for security and PWA
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
