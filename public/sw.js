const CACHE_NAME = 'flexio-v1';
const STATIC_CACHE = 'flexio-static-v1';
const API_CACHE = 'flexio-api-v1';

// Static assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/mi',
  '/mis-horas',
  '/manifest.json',
  '/favicon.svg',
  '/logo-flexio.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

// Install: precache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // Don't fail install if some assets are missing
        console.warn('[SW] Some precache URLs failed');
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome extensions and other origins
  if (!url.origin.includes(self.location.origin)) return;

  // API calls: Network-first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Face models: Cache-first (large, rarely change)
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Static assets (JS, CSS, images): Cache-first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navigation requests (HTML pages): Network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Everything else: Network-first
  event.respondWith(networkFirst(request, CACHE_NAME));
});

// Cache-first strategy
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

// Network-first strategy
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Network-first with offline HTML fallback for navigation
async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback: serve cached index for SPA routing
    const indexCached = await caches.match('/');
    if (indexCached) return indexCached;

    return new Response(offlineHTML(), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

function isStaticAsset(pathname) {
  return /\.(js|css|svg|png|jpg|jpeg|webp|woff2?|ttf|ico|json)$/.test(pathname);
}

function offlineHTML() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flexio — Sin conexión</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 40px; text-align: center; max-width: 360px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .icon { width: 64px; height: 64px; margin: 0 auto 20px; background: #fef3c7; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    h1 { font-size: 20px; color: #111827; margin-bottom: 8px; }
    p { font-size: 14px; color: #6b7280; line-height: 1.5; }
    .retry { margin-top: 24px; padding: 12px 24px; background: #059669; color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .retry:active { background: #047857; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
    </div>
    <h1>Sin conexión</h1>
    <p>No hay internet disponible. Tus registros offline se sincronizarán automáticamente cuando vuelvas a estar conectado.</p>
    <button class="retry" onclick="location.reload()">Reintentar</button>
  </div>
</body>
</html>`;
}
