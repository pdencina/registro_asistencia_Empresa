const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

const TZ = 'America/Santiago';

/**
 * GET /api/notifications/weekly-summary
 * Sends a weekly summary email to each tenant admin with last week's stats.
 * Triggered by Vercel Cron every Monday at 8:00 AM Chile.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(200).json({ message: 'No RESEND_API_KEY configured' });

  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';

  try {
    // Get all active tenants
    const tenants = await sql('SELECT * FROM tenants WHERE active = true');

    // Last week range (Monday to Sunday)
    const now = new Date();
    const day = now.getDay();
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - (day === 0 ? 13 : day + 6));
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    const startDate = lastMonday.toISOString().split('T')[0];
    const endDate = lastSunday.toISOString().split('T')[0];

    const results = [];

    for (const tenant of tenants) {
      if (!tenant.admin_email) continue;

      // Get employees count
      const [empCount] = await sql('SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND active = true', [tenant.id]);
      const totalEmployees = Number(empCount.count);
      if (totalEmployees === 0) continue;

      // Get attendance stats for last week
      const [entryCount] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as present, COUNT(*) as entries
        FROM attendance_records
        WHERE tenant_id = $1 AND type = 'entry'
          AND date(timestamp AT TIME ZONE $2) >= $3
          AND date(timestamp AT TIME ZONE $2) <= $4
      `, [tenant.id, TZ, startDate, endDate]);

      const present = Number(entryCount.present);
      const totalEntries = Number(entryCount.entries);

      // Get late arrivals (entries after 08:40 — simplified)
      const [lateCount] = await sql(`
        SELECT COUNT(*) as count
        FROM attendance_records
        WHERE tenant_id = $1 AND type = 'entry'
          AND date(timestamp AT TIME ZONE $2) >= $3
          AND date(timestamp AT TIME ZONE $2) <= $4
          AND EXTRACT(HOUR FROM timestamp AT TIME ZONE $2) * 60 + EXTRACT(MINUTE FROM timestamp AT TIME ZONE $2) > 520
      `, [tenant.id, TZ, startDate, endDate]);
      const lateArrivals = Number(lateCount.count);

      // Attendance rate (days with at least one entry / total possible)
      const workingDays = 5; // Simplified
      const attendanceRate = totalEmployees > 0 ? Math.round((present / totalEmployees) * 100) : 0;

      // Build email
      const emailHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:#2563eb;padding:25px;text-align:center;">
          <h1 style="color:#ffffff;font-size:20px;margin:0;">📊 Resumen Semanal</h1>
          <p style="color:#bfdbfe;font-size:13px;margin:6px 0 0 0;">${tenant.name} · ${startDate} al ${endDate}</p>
        </td></tr>
        <tr><td style="padding:30px;">
          <p style="font-size:15px;color:#374151;margin:0 0 20px 0;">
            Aquí tienes el resumen de asistencia de la semana pasada:
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
            <tr>
              <td style="padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;width:25%;">
                <p style="font-size:24px;font-weight:bold;color:#059669;margin:0;">${attendanceRate}%</p>
                <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Asistencia</p>
              </td>
              <td style="width:4%;"></td>
              <td style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center;width:25%;">
                <p style="font-size:24px;font-weight:bold;color:#374151;margin:0;">${totalEntries}</p>
                <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Marcajes</p>
              </td>
              <td style="width:4%;"></td>
              <td style="padding:12px;background:${lateArrivals > 0 ? '#fef3c7' : '#f0fdf4'};border-radius:8px;text-align:center;width:25%;">
                <p style="font-size:24px;font-weight:bold;color:${lateArrivals > 0 ? '#d97706' : '#059669'};margin:0;">${lateArrivals}</p>
                <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Atrasos</p>
              </td>
              <td style="width:4%;"></td>
              <td style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center;width:25%;">
                <p style="font-size:24px;font-weight:bold;color:#374151;margin:0;">${totalEmployees}</p>
                <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Equipo</p>
              </td>
            </tr>
          </table>

          ${attendanceRate >= 90
            ? '<p style="font-size:13px;color:#059669;background:#f0fdf4;padding:12px;border-radius:8px;margin:16px 0;">✅ Excelente semana. Asistencia por encima del 90%.</p>'
            : attendanceRate >= 70
            ? '<p style="font-size:13px;color:#d97706;background:#fef3c7;padding:12px;border-radius:8px;margin:16px 0;">⚠️ Asistencia bajo el estándar (90%). Revisar ausencias.</p>'
            : '<p style="font-size:13px;color:#dc2626;background:#fef2f2;padding:12px;border-radius:8px;margin:16px 0;">🔴 Asistencia crítica. Se recomienda acción inmediata.</p>'
          }

          <div style="text-align:center;margin:24px 0 0 0;">
            <a href="https://flexio.cl/admin/${tenant.slug}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Ver Dashboard Completo</a>
          </div>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Flexio · Resumen automático semanal · Cada lunes</p>
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
          to: [tenant.admin_email],
          subject: `📊 Resumen semanal — ${tenant.name} (${attendanceRate}% asistencia)`,
          html: emailHtml,
        }),
      }).catch(err => console.error('Error weekly summary:', err));

      results.push({ tenant: tenant.name, attendance_rate: attendanceRate, entries: totalEntries, late: lateArrivals });
    }

    return res.status(200).json({ ok: true, sent_to: results.length, results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
