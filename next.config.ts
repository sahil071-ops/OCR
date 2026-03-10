import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable serverExternalPackages for packages that use native node modules
  serverExternalPackages: ['tesseract.js', 'sharp', 'pdf-parse'],

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

  // Webpack configuration for pdf-parse compatibility
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdf-parse uses canvas - exclude it from client bundle
      config.externals = [...(config.externals || []), 'canvas'];
    }
    return config;
  },
};

export default nextConfig;
