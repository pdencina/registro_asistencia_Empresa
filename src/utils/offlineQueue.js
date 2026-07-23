/**
 * Offline Queue for attendance records.
 * Stores pending records in localStorage when offline,
 * and syncs them when connection is restored.
 */

const QUEUE_KEY = 'flexio_offline_queue';

export function getQueue() {
  try {
    const data = localStorage.getItem(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addToQueue(record) {
  const queue = getQueue();
  queue.push({
    ...record,
    queued_at: new Date().toISOString(),
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return queue.length;
}

export function removeFromQueue(id) {
  const queue = getQueue().filter(r => r.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function clearQueue() {
  localStorage.removeItem(QUEUE_KEY);
}

export async function syncQueue(apiBase = '/api') {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const record of queue) {
    try {
      const res = await fetch(`${apiBase}/attendance/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(record.tenant_slug ? { 'x-tenant-slug': record.tenant_slug } : {}),
        },
        body: JSON.stringify({
          employee_id: record.employee_id,
          type: record.type,
          notes: record.notes ? `${record.notes} | Offline: ${record.queued_at}` : `Offline: ${record.queued_at}`,
        }),
      });

      if (res.ok) {
        removeFromQueue(record.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
      break; // Still offline, stop trying
    }
  }

  return { synced, failed, remaining: getQueue().length };
}

// Auto-sync when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncQueue().then(result => {
      if (result.synced > 0) {
        console.log(`[Flexio Offline] Synced ${result.synced} records`);
      }
    });
  });
}
