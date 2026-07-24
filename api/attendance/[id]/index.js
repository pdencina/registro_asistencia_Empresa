const { getDb } = require('../../lib/db');
const { corsHeaders, handleCors } = require('../../lib/cors');
const { requireTenant } = require('../../lib/tenant');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { id } = req.query;
  const sql = getDb();

  try {
    if (req.method === 'PUT') {
      // Edit attendance record timestamp
      const { timestamp } = req.body;
      if (!timestamp) {
        return res.status(400).json({ error: 'timestamp es requerido' });
      }

      const [record] = await sql('SELECT * FROM attendance_records WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      if (!record) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }

      await sql('UPDATE attendance_records SET timestamp = $1 WHERE id = $2 AND tenant_id = $3', [timestamp, id, tenant.id]);

      const [updated] = await sql(`
        SELECT ar.*, e.first_name, e.last_name, e.rut, e.department, e.email
        FROM attendance_records ar
        JOIN employees e ON ar.employee_id = e.id
        WHERE ar.id = $1
      `, [id]);

      // Send notification to employee about the modification
      if (updated?.email) {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (RESEND_API_KEY) {
          const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';
          const oldTime = new Date(record.timestamp).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          const newTime = new Date(timestamp).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          const typeLabel = record.type === 'entry' ? 'entrada' : 'salida';

          const html = `<div style="font-family:-apple-system,sans-serif;padding:20px;max-width:500px;margin:0 auto;">
            <div style="background:#2563eb;color:white;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
              <h2 style="margin:0;font-size:18px;">Registro Modificado</h2>
              <p style="margin:5px 0 0;opacity:0.8;font-size:13px;">${tenant.name}</p>
            </div>
            <div style="background:#f9fafb;padding:25px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
              <p style="margin:0 0 15px;color:#374151;">Hola <strong>${updated.first_name}</strong>,</p>
              <p style="margin:0 0 15px;color:#6b7280;font-size:14px;">Tu administrador ha corregido tu registro de <strong>${typeLabel}</strong>:</p>
              <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;margin:15px 0;">
                <p style="margin:0 0 8px;font-size:13px;color:#6b7280;"><strong>Antes:</strong> ${oldTime}</p>
                <p style="margin:0;font-size:13px;color:#2563eb;"><strong>Ahora:</strong> ${newTime}</p>
              </div>
              <p style="margin:15px 0 0;font-size:12px;color:#9ca3af;">Si tienes dudas, contacta a tu administrador.</p>
            </div>
          </div>`;

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: `Flexio <${FROM_EMAIL}>`,
                to: [updated.email],
                subject: `Registro de ${typeLabel} corregido — ${tenant.name}`,
                html,
              }),
            });
          } catch (e) { console.error('Email notify edit error:', e); }
        }
      }

      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      // Verificar que el registro pertenece a este tenant
      const [record] = await sql('SELECT * FROM attendance_records WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      if (!record) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }

      await sql('DELETE FROM attendance_records WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);

      return res.status(200).json({ message: 'Registro eliminado', deleted: record });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
