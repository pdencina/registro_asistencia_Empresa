const { getDb } = require('../../lib/db');
const { corsHeaders, handleCors } = require('../../lib/cors');
const { requireAuth } = require('../../lib/auth');
const { logAudit, auditContext } = require('../../lib/auditLog');

// Los triggers de protección (Res. 38 DT) rechazan UPDATE/DELETE de marcaciones con este mensaje
const isProtectedRecordError = (e) => /No se permite (modificar|eliminar) registros de asistencia/.test(e && e.message || '');
const PROTECTED_MESSAGE = 'Las marcaciones son inalterables. La corrección con conservación del registro original estará disponible próximamente.';

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireAuth(req, res, req.method === 'GET' ? undefined : { roles: ['admin', 'rrhh'] });
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

      // 1) Constancia ANTES de modificar: si no se puede auditar, no se cambia nada.
      //    Se guarda el registro original completo (con su hash) para que la edición nunca sea silenciosa.
      const newTimestamp = new Date(timestamp);
      if (Number.isNaN(newTimestamp.getTime())) {
        return res.status(400).json({ error: 'timestamp inválido' });
      }
      await logAudit({
        ...auditContext(req),
        tenant_id: tenant.id,
        action: 'attendance.edit',
        target_type: 'attendance_record',
        target_id: id,
        details: { original_record: record, new_timestamp: newTimestamp.toISOString(), reason: req.body.reason || null, mode: 'direct_edit' },
      }, { strict: true });

      // 2) Modificación
      try {
        await sql('UPDATE attendance_records SET timestamp = $1 WHERE id = $2 AND tenant_id = $3', [newTimestamp.toISOString(), id, tenant.id]);
      } catch (e) {
        await logAudit({ ...auditContext(req), tenant_id: tenant.id, action: 'attendance.edit_failed', target_type: 'attendance_record', target_id: id, details: { error: e.message } });
        if (isProtectedRecordError(e)) return res.status(409).json({ error: PROTECTED_MESSAGE, code: 'RECORD_PROTECTED' });
        throw e;
      }

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

      // Constancia ANTES de borrar, con el registro original completo (recuperable desde la auditoría)
      await logAudit({
        ...auditContext(req),
        tenant_id: tenant.id,
        action: 'attendance.delete',
        target_type: 'attendance_record',
        target_id: id,
        details: { original_record: record, reason: (req.body && req.body.reason) || null, mode: 'direct_delete' },
      }, { strict: true });

      try {
        await sql('DELETE FROM attendance_records WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      } catch (e) {
        await logAudit({ ...auditContext(req), tenant_id: tenant.id, action: 'attendance.delete_failed', target_type: 'attendance_record', target_id: id, details: { error: e.message } });
        if (isProtectedRecordError(e)) return res.status(409).json({ error: PROTECTED_MESSAGE, code: 'RECORD_PROTECTED' });
        throw e;
      }

      return res.status(200).json({ message: 'Registro eliminado', deleted: record });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
