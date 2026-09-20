// Sesión de administrador: guarda el token firmado que emite /api/auth/login
// y lo adjunta automáticamente a las llamadas /api/ (ver installAuthFetch).
// El servidor deriva la empresa y el rol del token; estos datos locales son solo para la UI.

const KEYS = ['admin_token', 'admin_auth', 'admin_tenant', 'admin_email', 'admin_role'];

export function getAdminToken() {
  try { return sessionStorage.getItem('admin_token') || ''; } catch { return ''; }
}

export function setAdminSession(data) {
  try {
    sessionStorage.setItem('admin_token', data.token || '');
    sessionStorage.setItem('admin_auth', 'true');
    sessionStorage.setItem('admin_tenant', data.tenant_slug);
    sessionStorage.setItem('admin_email', data.admin_email);
    sessionStorage.setItem('admin_role', data.role || 'admin');
  } catch { /* sessionStorage no disponible */ }
}

export function clearAdminSession() {
  try { KEYS.forEach((k) => sessionStorage.removeItem(k)); } catch { /* noop */ }
}

/** Hay sesión utilizable para la empresa indicada (o para cualquiera si no se indica). */
export function hasAdminSession(tenantSlug) {
  try {
    if (!getAdminToken()) return false;
    return !tenantSlug || sessionStorage.getItem('admin_tenant') === tenantSlug;
  } catch { return false; }
}

let installed = false;

/**
 * Envuelve window.fetch: agrega "Authorization: Bearer <token>" a las llamadas same-origin a /api/
 * que no traigan su propio Authorization (p. ej. superadmin). Si el servidor indica que la sesión
 * venció (X-Session-Expired), limpia la sesión y vuelve al login.
 */
export function installAuthFetch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const isApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
    const token = getAdminToken();

    let nextInit = init;
    let sentToken = false;
    if (isApi && token) {
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
        sentToken = true;
      }
      nextInit = { ...init, headers };
    }

    const response = await original(input, nextInit);

    if (sentToken && response.status === 401 && response.headers.get('X-Session-Expired')) {
      clearAdminSession();
      if (!window.location.pathname.startsWith('/login')) window.location.assign('/login');
    }
    return response;
  };
}
