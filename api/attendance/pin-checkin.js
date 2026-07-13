const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * POST /api/attendance/pin-checkin
 * Marcaje alternativo por PIN personal (para quienes no dieron consentimiento biométrico).
 * 
 * Body: { pin, action: 'identify' | 'entry' | 'exit' }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    const { pin, action } = req.body;

    if (!pin || !action) {
      return res.status(400).json({ error: 'PIN y acción son obligatorios' });
    }

    // Asegurar columna personal_pin existe
    await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_pin VARCHAR(10)');

    // Buscar empleado por PIN personal dentro del tenant
    const employees = await sql(
      'SELECT * FROM employees WHERE personal_pin = $1 AND tenant_id = $2 AND active = true',
      [pin, tenant.id]
    );

    if (employees.length === 0) {
      return res.status(401).json({ error: 'PIN no reconocido. Verifica con tu administrador.' });
    }

    const employee = employees[0];

    // Acción: solo identificar
    if (action === 'identify') {
      // Obtener estado del día
      const records = await sql(`
        SELECT * FROM attendance_records 
        WHERE employee_id = $1 AND tenant_id = $2
          AND date(timestamp AT TIME ZONE $3) = date(NOW() AT TIME ZONE $3)
        ORDER BY timestamp DESC LIMIT 1
      `, [employee.id, tenant.id, TZ]);

      const lastRecord = records.length > 0 ? records[0] : null;
      const status = !lastRecord ? 'absent' :
                     lastRecord.type === 'entry' ? 'present' : 'exited';

      return res.status(200).json({
        employee: {
          id: employee.id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          department: employee.department,
        },
        status: { status, last_record: lastRecord },
      });
    }

    // Acción: registrar entrada o salida
    if (action === 'entry' || action === 'exit') {
      // Verificar estado actual
      const records = await sql(`
        SELECT * FROM attendance_records 
        WHERE employee_id = $1 AND tenant_id = $2
          AND date(timestamp AT TIME ZONE $3) = date(NOW() AT TIME ZONE $3)
        ORDER BY timestamp DESC LIMIT 1
      `, [employee.id, tenant.id, TZ]);

      const lastRecord = records.length > 0 ? records[0] : null;
      const currentStatus = !lastRecord ? 'absent' :
                           lastRecord.type === 'entry' ? 'present' : 'exited';

      if (action === 'entry' && (currentStatus === 'present' || currentStatus === 'exited')) {
        return res.status(400).json({ error: 'Ya registraste tu ingreso hoy' });
      }
      if (action === 'exit' && currentStatus !== 'present') {
        return res.status(400).json({ error: 'Debes registrar ingreso primero' });
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await sql(
        `INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
         VALUES ($1, $2, $3, $4, $5, 'pin', 'Marcaje por PIN personal')`,
        [id, tenant.id, employee.id, action, now]
      );

      // Enviar email si tiene
      if (employee.email) {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (RESEND_API_KEY) {
          // Reutilizar la misma función de email (fire and forget)
          sendNotification(RESEND_API_KEY, employee, action, now, tenant).catch(() => {});
        }
      }

      return res.status(201).json({ message: `${action === 'entry' ? 'Ingreso' : 'Salida'} registrado`, method: 'pin' });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

async function sendNotification(apiKey, employee, type, timestamp, tenant) {
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const typeLabel = type === 'entry' ? 'Entrada' : 'Salida';
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';

  const html = `<div style="font-family:sans-serif;padding:20px;">
    <p>Hola <strong>${employee.first_name}</strong>,</p>
    <p>Tu ${typeLabel.toLowerCase()} ha sido registrado (método: PIN).</p>
    <p><strong>Hora:</strong> ${timeStr}<br><strong>Fecha:</strong> ${dateStr}</p>
    <p style="color:#666;font-size:12px;">Flexio · flexio.cl</p>
  </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Flexio <${FROM_EMAIL}>`,
      to: [employee.email],
      subject: `Registro de ${typeLabel.toLowerCase()} — ${timeStr}`,
      html,
    }),
  });
}
