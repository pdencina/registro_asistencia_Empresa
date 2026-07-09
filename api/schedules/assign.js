const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const sql = getDb();

  // Ensure tables exist
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS work_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        entry_time TIME NOT NULL DEFAULT '08:30',
        exit_time TIME NOT NULL DEFAULT '18:00',
        tolerance_minutes INTEGER NOT NULL DEFAULT 10,
        is_default BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await sql(`
      CREATE TABLE IF NOT EXISTS employee_schedules (
        employee_id UUID PRIMARY KEY,
        schedule_id UUID,
        custom_entry_time TIME,
        custom_exit_time TIME,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (e) {
    // Tables might already exist
  }

  try {
    // POST: Assign schedule to employee (or custom times)
    if (req.method === 'POST') {
      const { employee_id, schedule_id, custom_entry_time, custom_exit_time } = req.body;

      if (!employee_id) {
        return res.status(400).json({ error: 'employee_id es requerido' });
      }

      await sql(`
        INSERT INTO employee_schedules (employee_id, schedule_id, custom_entry_time, custom_exit_time, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (employee_id) DO UPDATE SET 
          schedule_id = $2, custom_entry_time = $3, custom_exit_time = $4, updated_at = NOW()
      `, [employee_id, schedule_id || null, custom_entry_time || null, custom_exit_time || null]);

      return res.status(200).json({ message: 'Horario asignado' });
    }

    // GET: Get employee schedule
    if (req.method === 'GET') {
      const { employee_id } = req.query;

      if (!employee_id) {
        return res.status(400).json({ error: 'employee_id es requerido' });
      }

      // Get employee-specific schedule or fall back to default
      const [assignment] = await sql(`
        SELECT es.*, ws.name as schedule_name, ws.entry_time as schedule_entry, 
               ws.exit_time as schedule_exit, ws.tolerance_minutes
        FROM employee_schedules es
        LEFT JOIN work_schedules ws ON es.schedule_id = ws.id
        WHERE es.employee_id = $1
      `, [employee_id]);

      if (assignment) {
        return res.status(200).json({
          entry_time: assignment.custom_entry_time || assignment.schedule_entry,
          exit_time: assignment.custom_exit_time || assignment.schedule_exit,
          tolerance_minutes: assignment.tolerance_minutes || 10,
          schedule_name: assignment.schedule_name || 'Personalizado',
          is_custom: !!assignment.custom_entry_time,
        });
      }

      // Fall back to default schedule
      const [defaultSchedule] = await sql('SELECT * FROM work_schedules WHERE is_default = true LIMIT 1');
      if (defaultSchedule) {
        return res.status(200).json({
          entry_time: defaultSchedule.entry_time,
          exit_time: defaultSchedule.exit_time,
          tolerance_minutes: defaultSchedule.tolerance_minutes,
          schedule_name: defaultSchedule.name,
          is_custom: false,
        });
      }

      // No schedule configured
      return res.status(200).json({
        entry_time: '08:30',
        exit_time: '18:00',
        tolerance_minutes: 10,
        schedule_name: 'Por defecto',
        is_custom: false,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
