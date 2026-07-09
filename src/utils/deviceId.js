// Genera un ID único para este dispositivo/navegador
// Se guarda en localStorage para persistir entre sesiones
export function getDeviceId() {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = generateFingerprint();
    localStorage.setItem('device_id', id);
  }
  return id;
}

function generateFingerprint() {
  const nav = window.navigator;
  const screen = window.screen;

  // Combinar características del dispositivo para crear un fingerprint
  const components = [
    nav.userAgent,
    nav.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || 'unknown',
    nav.platform,
    // Random component to ensure uniqueness
    crypto.randomUUID(),
  ];

  return hashCode(components.join('|'));
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to positive hex string
  return 'dev_' + Math.abs(hash).toString(16) + '_' + Date.now().toString(36);
}

// Verifica si este dispositivo está autorizado
export function isDeviceAuthorized() {
  const authorizedDevices = getAuthorizedDevices();
  const currentDevice = getDeviceId();
  return authorizedDevices.includes(currentDevice);
}

// Autoriza este dispositivo
export function authorizeDevice() {
  const devices = getAuthorizedDevices();
  const currentDevice = getDeviceId();
  if (!devices.includes(currentDevice)) {
    devices.push(currentDevice);
    localStorage.setItem('authorized_devices', JSON.stringify(devices));
  }
}

// Para verificación del lado del servidor
export function getAuthorizedDevices() {
  try {
    return JSON.parse(localStorage.getItem('authorized_devices') || '[]');
  } catch {
    return [];
  }
}
