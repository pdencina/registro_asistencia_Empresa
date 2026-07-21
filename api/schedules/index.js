const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const sql = getDb();

  // Ensure tables exist
  await sql(`
    CREATE TABLE IF NOT EXISTS work_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      entry_time TIME NOT NULL DEFAULT '08:30',
      exit_time TIME NOT NULL DEFAULT '18:00',
      tolerance_minutes INTEGER NOT NULL DEFAULT 10,
      is_default BOOLEAN DEFAULT false,
      block2_entry_time TIME,
      block2_exit_time TIME,
      shift_type VARCHAR(20) DEFAULT 'fixed',
      rotation_days_on INTEGER,
      rotation_days_off INTEGER,
      rotation_start_date DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Add new columns if table already exists
  await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS block2_entry_time TIME');
  await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS block2_exit_time TIME');
  await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20) DEFAULT \'fixed\'');
  await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS rotation_days_on INTEGER');
  await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS rotation_days_off INTEGER');
  await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS rotation_start_date DATE');
  await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS weekly_hours INTEGER');

  await sql(`
    CREATE TABLE IF NOT EXISTS employee_schedules (
      employee_id UUID PRIMARY KEY REFERENCES employees(id),
      schedule_id UUID REFERENCES work_schedules(id),
      custom_entry_time TIME,
      custom_exit_time TIME,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await sql(`
    CREATE TABLE IF NOT EXISTS authorizers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      position VARCHAR(100),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await sql(`
    CREATE TABLE IF NOT EXISTS early_exits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attendance_record_id UUID REFERENCES attendance_records(id),
      employee_id UUID REFERENCES employees(id),
      reason VARCHAR(50) NOT NULL,
      authorized_by UUID REFERENCES authorizers(id),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  try {
    // GET: List all schedules
    if (req.method === 'GET') {
      const schedules = await sql('SELECT * FROM work_schedules ORDER BY is_default DESC, name');

      // If no schedules exist, create a default one
      if (schedules.length === 0) {
        await sql(`
          INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, is_default)
          VALUES (gen_random_uuid(), 'Jornada Completa', '08:30', '18:00', 10, true)
        `);
        const newSchedules = await sql('SELECT * FROM work_schedules ORDER BY is_default DESC, name');
        return res.status(200).json(newSchedules);
      }

      return res.status(200).json(schedules);
    }

    // POST: Create a new schedule
    if (req.method === 'POST') {
      const { name, entry_time, exit_time, tolerance_minutes, is_default, block2_entry_time, block2_exit_time, shift_type, rotation_days_on, rotation_days_off, rotation_start_date } = req.body;

      if (!name || !entry_time || !exit_time) {
        return res.status(400).json({ error: 'Nombre, hora de entrada y salida son obligatorios' });
      }

      if (shift_type === 'rotating' && (!rotation_days_on || !rotation_days_off)) {
        return res.status(400).json({ error: 'Para turnos rotativos se requieren días de trabajo y descanso' });
      }

      if (shift_type === 'flexible' && !req.body.weekly_hours) {
        return res.status(400).json({ error: 'Para jornada flexible se requieren las horas semanales contratadas' });
      }

      // If setting as default, unset others
      if (is_default) {
        await sql('UPDATE work_schedules SET is_default = false');
      }

      const [schedule] = await sql(`
        INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, is_default, block2_entry_time, block2_exit_time, shift_type, rotation_days_on, rotation_days_off, rotation_start_date, weekly_hours)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [name, entry_time || '00:00', exit_time || '00:00', tolerance_minutes || 10, is_default || false, block2_entry_time || null, block2_exit_time || null, shift_type || 'fixed', rotation_days_on || null, rotation_days_off || null, rotation_start_date || null, req.body.weekly_hours || null]);

      return res.status(201).json(schedule);
    }

    // PUT: Update a schedule
    if (req.method === 'PUT') {
      const { id, name, entry_time, exit_time, tolerance_minutes, is_default, block2_entry_time, block2_exit_time, shift_type, rotation_days_on, rotation_days_off, rotation_start_date } = req.body;

      if (!id) return res.status(400).json({ error: 'id es requerido' });

      if (is_default) {
        await sql('UPDATE work_schedules SET is_default = false');
      }

      await sql(`
        UPDATE work_schedules SET name = $1, entry_time = $2, exit_time = $3, tolerance_minutes = $4, is_default = $5, block2_entry_time = $6, block2_exit_time = $7, shift_type = $8, rotation_days_on = $9, rotation_days_off = $10, rotation_start_date = $11
        WHERE id = $12
      `, [name, entry_time, exit_time, tolerance_minutes, is_default, block2_entry_time || null, block2_exit_time || null, shift_type || 'fixed', rotation_days_on || null, rotation_days_off || null, rotation_start_date || null, id]);

      const [updated] = await sql('SELECT * FROM work_schedules WHERE id = $1', [id]);
      return res.status(200).json(updated);
    }

    // DELETE: Remove a schedule
    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql('DELETE FROM employee_schedules WHERE schedule_id = $1', [id]);
      await sql('DELETE FROM work_schedules WHERE id = $1', [id]);
      return res.status(200).json({ message: 'Horario eliminado' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
