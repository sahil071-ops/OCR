// Service Worker for Invoice Scanner PWA
// Implements:
// - Cache-first for static assets
// - Network-first for API calls
// - Background sync for uploads (future)
// - Auto-update notification

const CACHE_VERSION = 'v1'; // This gets replaced at build time by the build script
const CACHE_NAME = `invoice-scanner-${CACHE_VERSION}`;
const APP_VERSION_KEY = 'app-version';

// Assets to pre-cache (static shell)
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192x192.png',
];

// ── Install: pre-cache static assets ──
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Failed to pre-cache some assets:', err);
      });
    }).then(() => {
      // Skip waiting to activate immediately
      return self.skipWaiting();
    })
  );
});

// ── Activate: delete old caches ──
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      // Delete old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('invoice-scanner-') && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      }),
      // Take control of all open pages immediately
      self.clients.claim(),
    ])
  );
});

// ── Fetch: routing strategy ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API calls - always network-first, no caching
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ success: false, error: 'Offline - network unavailable' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Skip uploads directory
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For Next.js pages and static assets: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, return cached root
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('', { status: 503 });
        });
      })
  );
});

// ── Message handler: force update ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
