const CACHE_NAME = 'flexio-v2';
const STATIC_CACHE = 'flexio-static-v2';
const API_CACHE = 'flexio-api-v2';
const OFFLINE_QUEUE_DB = 'flexio-offline-queue';
const OFFLINE_QUEUE_STORE = 'pending-records';

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

// ===== INDEXEDDB FOR OFFLINE QUEUE =====

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        const store = db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addToOfflineQueue(record) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUEUE_STORE);
    store.add({
      ...record,
      status: 'pending',
      created_at: new Date().toISOString(),
      attempts: 0,
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPendingRecords() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readonly');
    const store = tx.objectStore(OFFLINE_QUEUE_STORE);
    const index = store.index('status');
    const request = index.getAll('pending');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function markRecordSynced(id) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUEUE_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        record.status = 'synced';
        record.synced_at = new Date().toISOString();
        store.put(record);
      }
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function markRecordFailed(id) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUEUE_STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        record.attempts = (record.attempts || 0) + 1;
        if (record.attempts >= 5) record.status = 'failed';
        store.put(record);
      }
      tx.oncomplete = () => resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

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

  // --- OFFLINE ATTENDANCE: Intercept POST to attendance endpoints ---
  if (request.method === 'POST' && isAttendanceEndpoint(url.pathname)) {
    event.respondWith(handleAttendancePost(request));
    return;
  }

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

// ===== OFFLINE ATTENDANCE HANDLING =====

function isAttendanceEndpoint(pathname) {
  return pathname === '/api/attendance/register' || pathname === '/api/attendance/pin-checkin';
}

/**
 * Intenta enviar la marcación al servidor.
 * Si falla (sin conexión), la guarda en IndexedDB para sync posterior.
 */
async function handleAttendancePost(request) {
  const body = await request.clone().json();
  const headers = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key] = value;
  }
  const url = request.url;

  try {
    // Intentar enviar al servidor
    const response = await fetch(request.clone());
    return response;
  } catch (err) {
    // Sin conexión — guardar en cola offline
    await addToOfflineQueue({
      url,
      method: 'POST',
      headers,
      body,
      offline_timestamp: new Date().toISOString(),
    });

    // Notificar al cliente que se guardó offline
    notifyClients({
      type: 'OFFLINE_RECORD_SAVED',
      data: {
        message: 'Registro guardado offline. Se sincronizará automáticamente.',
        timestamp: new Date().toISOString(),
        body,
      },
    });

    // Registrar para Background Sync
    if (self.registration.sync) {
      await self.registration.sync.register('sync-attendance');
    }

    return new Response(JSON.stringify({
      offline: true,
      message: 'Registro guardado offline. Se sincronizará al recuperar conexión.',
      queued_at: new Date().toISOString(),
    }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ===== BACKGROUND SYNC =====

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(syncPendingRecords());
  }
});

/**
 * Sincroniza todos los registros pendientes en la cola offline.
 */
async function syncPendingRecords() {
  const pending = await getPendingRecords();

  if (pending.length === 0) return;

  let syncedCount = 0;
  let failedCount = 0;

  for (const record of pending) {
    try {
      const response = await fetch(record.url, {
        method: 'POST',
        headers: record.headers,
        body: JSON.stringify({
          ...record.body,
          _offline_sync: true,
          _offline_timestamp: record.offline_timestamp,
        }),
      });

      if (response.ok || response.status === 201) {
        await markRecordSynced(record.id);
        syncedCount++;
      } else {
        await markRecordFailed(record.id);
        failedCount++;
      }
    } catch (err) {
      await markRecordFailed(record.id);
      failedCount++;
    }
  }

  // Notificar al cliente
  notifyClients({
    type: 'SYNC_COMPLETE',
    data: { synced: syncedCount, failed: failedCount, total: pending.length },
  });
}

// ===== PERIODIC SYNC CHECK (fallback for browsers without Background Sync) =====

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_NOW') {
    syncPendingRecords();
  }
  if (event.data && event.data.type === 'GET_PENDING_COUNT') {
    getPendingRecords().then((records) => {
      event.source.postMessage({ type: 'PENDING_COUNT', count: records.length });
    });
  }
});

// Notify all open clients
function notifyClients(message) {
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => client.postMessage(message));
  });
}

// When coming back online, trigger sync
self.addEventListener('online', () => {
  syncPendingRecords();
});

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
