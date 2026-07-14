const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { getTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * GET/POST /api/notifications/check-absent
 * 
 * Checks for employees who haven't checked in and sends alert email to admin.
 * Can be triggered manually from the dashboard or via Vercel Cron.
 * 
 * Supports: x-tenant-slug header for specific tenant, or processes all tenants (cron mode).
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    // Check if running for a specific tenant or all
    const tenant = await getTenant(req);
    const tenants = tenant ? [tenant] : await sql('SELECT * FROM tenants WHERE active = true');

    const results = [];

    for (const t of tenants) {
      // Get all active employees for this tenant
      const allEmployees = await sql(
        'SELECT id, first_name, last_name, department, email FROM employees WHERE tenant_id = $1 AND active = true',
        [t.id]
      );

      if (allEmployees.length === 0) continue;

      // Get who checked in today
      const presentToday = await sql(`
        SELECT DISTINCT employee_id 
        FROM attendance_records 
        WHERE tenant_id = $1 AND type = 'entry'
          AND date(timestamp AT TIME ZONE $2) = date(NOW() AT TIME ZONE $2)
      `, [t.id, TZ]);

      const presentIds = new Set(presentToday.map(r => r.employee_id));
      const absentEmployees = allEmployees.filter(e => !presentIds.has(e.id));

      // Get current time in Chile
      const nowChile = new Date().toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
      const dateChile = new Date().toLocaleDateString('es-CL', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });

      results.push({
        tenant: t.name,
        total: allEmployees.length,
        present: presentToday.length,
        absent_count: absentEmployees.length,
        absent_employees: absentEmployees.map(e => ({ name: `${e.first_name} ${e.last_name}`, department: e.department })),
      });

      // Send email alert to admin if there are absences
      if (absentEmployees.length > 0 && t.admin_email) {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (RESEND_API_KEY) {
          const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL || 'notificaciones@flexio.cl';

          const absentList = absentEmployees
            .map(e => `<tr><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${e.first_name} ${e.last_name}</td><td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">${e.department || '—'}</td></tr>`)
            .join('');

          const emailHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:#dc2626;padding:25px;text-align:center;">
          <h1 style="color:#ffffff;font-size:20px;margin:0;">⚠️ Alerta de Ausencias</h1>
          <p style="color:#fecaca;font-size:13px;margin:6px 0 0 0;">${t.name} · ${dateChile} · ${nowChile}</p>
        </td></tr>
        <tr><td style="padding:30px;">
          <p style="font-size:15px;color:#374151;margin:0 0 16px 0;">
            <strong>${absentEmployees.length} colaborador${absentEmployees.length > 1 ? 'es' : ''}</strong> no ${absentEmployees.length > 1 ? 'han' : 'ha'} registrado ingreso hoy.
          </p>

          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:4px;margin:16px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:8px 12px;font-size:11px;color:#991b1b;font-weight:600;text-transform:uppercase;">Nombre</td><td style="padding:8px 12px;font-size:11px;color:#991b1b;font-weight:600;text-transform:uppercase;">Departamento</td></tr>
              ${absentList}
            </table>
          </div>

          <div style="background:#f8fafc;border-radius:8px;padding:12px;margin:20px 0;">
            <p style="font-size:12px;color:#64748b;margin:0;">
              Presentes: <strong>${presentToday.length}</strong> · Ausentes: <strong>${absentEmployees.length}</strong> · Total: <strong>${allEmployees.length}</strong>
            </p>
          </div>

          <div style="text-align:center;margin:24px 0 0 0;">
            <a href="https://flexio.cl/admin/${t.slug}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Ver Dashboard</a>
          </div>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Flexio · Alerta automática de asistencia</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: `Flexio <${FROM_EMAIL}>`,
              to: [t.admin_email],
              subject: `⚠️ ${absentEmployees.length} ausencia${absentEmployees.length > 1 ? 's' : ''} hoy — ${t.name}`,
              html: emailHtml,
            }),
          }).catch(err => console.error('Error enviando alerta:', err));
        }
      }
    }

    return res.status(200).json({
      ok: true,
      checked_at: new Date().toISOString(),
      tenants_checked: results.length,
      results,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
