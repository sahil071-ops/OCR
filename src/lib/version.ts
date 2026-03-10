// App version management
// Version is baked in at build time via environment variables

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'v0.1.0-dev';
export const BUILD_TIMESTAMP = process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || new Date().toISOString();
export const RELEASE_NOTES = process.env.NEXT_PUBLIC_RELEASE_NOTES || 'Initial release';
export const APP_ENVIRONMENT = process.env.NODE_ENV || 'development';
