/**
 * IndexedDB cache for face descriptors.
 * Stores computed face descriptors per employee photo_url.
 * On subsequent kiosk starts, loads from cache instead of re-downloading
 * and re-processing all photos (saves 30-60s with 68+ employees).
 * 
 * Cache invalidation: if photo_url changes, the old descriptor is stale
 * and will be recomputed.
 */

const DB_NAME = 'flexio_face_cache';
const STORE_NAME = 'descriptors';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get cached descriptor for an employee.
 * Returns Float32Array descriptor or null if not cached/stale.
 */
export async function getCachedDescriptor(employeeId, photoUrl) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(employeeId);
      request.onsuccess = () => {
        const data = request.result;
        if (data && data.photoUrl === photoUrl && data.descriptor) {
          // Return as Float32Array (stored as regular array)
          resolve(new Float32Array(data.descriptor));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Store descriptor in cache.
 */
export async function cacheDescriptor(employeeId, photoUrl, descriptor) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id: employeeId,
        photoUrl,
        descriptor: Array.from(descriptor), // Float32Array → Array for storage
        cachedAt: Date.now(),
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Clear all cached descriptors.
 */
export async function clearDescriptorCache() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
