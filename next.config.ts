import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
