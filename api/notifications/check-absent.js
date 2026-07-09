const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

const TZ = 'America/Santiago';

/**
 * Endpoint para verificar ausencias y enviar notificaciones.
 * Se puede llamar manualmente o programar con un cron (Vercel Cron).
 * 
 * Envía un webhook con la lista de empleados ausentes.
 * Configura WEBHOOK_URL en las variables de entorno (Slack, Teams, email service, etc.)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    // Get all active employees
    const allEmployees = await sql('SELECT id, first_name, last_name, department, rut FROM employees WHERE active = true');

    // Get who checked in today
    const presentToday = await sql(`
      SELECT DISTINCT employee_id 
      FROM attendance_records 
      WHERE date(timestamp AT TIME ZONE $1) = date(NOW() AT TIME ZONE $1)
    `, [TZ]);

    const presentIds = new Set(presentToday.map(r => r.employee_id));
    const absentEmployees = allEmployees.filter(e => !presentIds.has(e.id));

    // If no webhook URL configured, just return the data
    const webhookUrl = process.env.WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(200).json({
        message: 'No hay WEBHOOK_URL configurado',
        date: new Date().toLocaleDateString('es-CL', { timeZone: TZ }),
        total_employees: allEmployees.length,
        present: presentToday.length,
        absent_count: absentEmployees.length,
        absent_employees: absentEmployees,
      });
    }

    // Send webhook notification
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-CL', { timeZone: TZ });
    const timeStr = now.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

    const payload = {
      text: `📋 *Reporte de Asistencia - ${dateStr} ${timeStr}*\n\n` +
        `✅ Presentes: ${presentToday.length}/${allEmployees.length}\n` +
        `❌ Ausentes: ${absentEmployees.length}\n\n` +
        (absentEmployees.length > 0
          ? `*Empleados sin registro:*\n${absentEmployees.map(e => `• ${e.first_name} ${e.last_name} (${e.department || 'Sin área'})`).join('\n')}`
          : '🎉 Todos presentes hoy'),
      // Slack-compatible format
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📋 Reporte de Asistencia - ${dateStr}` }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Presentes:* ${presentToday.length}/${allEmployees.length} | *Ausentes:* ${absentEmployees.length}`
          }
        },
        ...(absentEmployees.length > 0 ? [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Sin registro:*\n${absentEmployees.map(e => `• ${e.first_name} ${e.last_name} — ${e.department || 'Sin área'}`).join('\n')}`
          }
        }] : [{
          type: 'section',
          text: { type: 'mrkdwn', text: '🎉 Todos los empleados presentes hoy' }
        }])
      ]
    };

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return res.status(200).json({
      message: 'Notificación enviada',
      webhook_status: webhookResponse.status,
      absent_count: absentEmployees.length,
      absent_employees: absentEmployees,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
