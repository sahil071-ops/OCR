'use client';

import { useEffect } from 'react';

/**
 * Service Worker registration component
 * Place this in the root layout to register the SW on all pages
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[SW] Registered:', registration.scope);

          // Listen for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content is available, show notification
                console.log('[SW] New version available');
                // The AppShell component handles showing the update banner
                // via polling the /api/health endpoint
              }
            });
          });
        })
        .catch((error) => {
          console.warn('[SW] Registration failed:', error);
        });
    }
  }, []);

  return null;
}
