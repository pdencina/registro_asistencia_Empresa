/**
 * Correos automáticos del sistema (cuenta de "sistema" no nominativa: Res. Ex. N.º 38, Art. 12 d).
 * Si Resend no está configurado no falla: informa { sent: false } para que el llamador decida.
 */

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendSystemEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'NOT_CONFIGURED' };
  const from = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Flexio <${from}>`, to: [to], subject, html }),
    });
    return res.ok ? { sent: true } : { sent: false, reason: `HTTP_${res.status}` };
  } catch (e) {
    return { sent: false, reason: 'NETWORK' };
  }
}

/** Fecha y hora en formato dd/mm/aa hh:mm:ss, zona Chile (Art. 13.1 a y b). */
function formatChileDateTime(date = new Date()) {
  const d = new Date(date);
  const opts = { timeZone: 'America/Santiago' };
  const day = d.toLocaleDateString('es-CL', { ...opts, day: '2-digit', month: '2-digit', year: '2-digit' });
  const time = d.toLocaleTimeString('es-CL', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${day} ${time}`;
}

module.exports = { sendSystemEmail, escapeHtml, formatChileDateTime };
