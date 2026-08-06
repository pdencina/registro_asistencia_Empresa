/**
 * Utilidades de sincronización offline para Flexio.
 * Se comunica con el Service Worker para gestionar registros pendientes.
 * 
 * Resolución 38 DT — Disponibilidad ante fallas de conectividad.
 */

/**
 * Registra el Service Worker y configura listeners.
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[Offline] Service Workers no soportados');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[Offline] Service Worker registrado');

    // Registrar Background Sync si está disponible
    if ('sync' in registration) {
      console.log('[Offline] Background Sync disponible');
    }

    return registration;
  } catch (err) {
    console.error('[Offline] Error registrando SW:', err);
    return null;
  }
}

/**
 * Escucha mensajes del Service Worker (sync completado, etc.)
 * @param {Function} onSyncComplete - Callback cuando se sincronicen registros
 * @param {Function} onOfflineSave - Callback cuando se guarde un registro offline
 */
export function listenToSyncEvents(onSyncComplete, onOfflineSave) {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (event) => {
    const { type, data } = event.data || {};

    if (type === 'SYNC_COMPLETE' && onSyncComplete) {
      onSyncComplete(data);
    }
    if (type === 'OFFLINE_RECORD_SAVED' && onOfflineSave) {
      onOfflineSave(data);
    }
    if (type === 'PENDING_COUNT' && window._pendingCountCallback) {
      window._pendingCountCallback(data.count);
    }
  });
}

/**
 * Solicita al SW que sincronice ahora (para usar cuando se detecta reconexión).
 */
export function triggerSync() {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SYNC_NOW' });
  }
}

/**
 * Obtiene la cantidad de registros pendientes de sincronizar.
 * @returns {Promise<number>}
 */
export function getPendingCount() {
  return new Promise((resolve) => {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      resolve(0);
      return;
    }

    window._pendingCountCallback = (count) => {
      resolve(count);
      window._pendingCountCallback = null;
    };

    navigator.serviceWorker.controller.postMessage({ type: 'GET_PENDING_COUNT' });

    // Timeout fallback
    setTimeout(() => {
      if (window._pendingCountCallback) {
        resolve(0);
        window._pendingCountCallback = null;
      }
    }, 2000);
  });
}

/**
 * Hook para detectar estado online/offline y sincronizar automáticamente.
 */
export function setupAutoSync() {
  window.addEventListener('online', () => {
    console.log('[Offline] Conexión restaurada — sincronizando...');
    triggerSync();
  });

  window.addEventListener('offline', () => {
    console.log('[Offline] Sin conexión — modo offline activo');
  });
}

/**
 * Verifica si hay conexión a internet.
 */
export function isOnline() {
  return navigator.onLine;
}
