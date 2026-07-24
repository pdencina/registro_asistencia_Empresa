const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * POST /api/schedules/bulk
 * 
 * Bulk import/create schedules from a JSON array.
 * Used for multi-shift environments (e.g. schools with 130+ different schedules).
 * 
 * Body: { schedules: [{ name, entry_time, exit_time, tolerance_minutes?, shift_type?, ... }] }
 * 
 * Also supports: { assignments: [{ employee_rut, schedule_name }] }
 * to bulk-assign employees to schedules by RUT + schedule name.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const { schedules, assignments } = req.body;

  try {
    let createdCount = 0;
    let updatedCount = 0;
    let assignedCount = 0;
    const errors = [];

    // Bulk create/update schedules
    if (schedules && Array.isArray(schedules)) {
      for (const s of schedules) {
        if (!s.name || !s.entry_time || !s.exit_time) {
          errors.push(`Turno "${s.name || '?'}": falta nombre, entry_time o exit_time`);
          continue;
        }

        // Check if schedule with same name already exists
        const existing = await sql(
          'SELECT id FROM work_schedules WHERE name = $1 AND tenant_id = $2',
          [s.name, tenant.id]
        ).catch(() => []);

        // Add tenant_id column if not exists (multi-tenant support for schedules)
        await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS tenant_id UUID').catch(() => {});

        if (existing.length > 0) {
          // Update existing
          await sql(`
            UPDATE work_schedules SET 
              entry_time = $1, exit_time = $2, tolerance_minutes = $3,
              block2_entry_time = $4, block2_exit_time = $5,
              shift_type = $6, lunch_break_minutes = $7
            WHERE id = $8
          `, [
            s.entry_time, s.exit_time, s.tolerance_minutes || 10,
            s.block2_entry_time || null, s.block2_exit_time || null,
            s.shift_type || 'fixed', s.lunch_break_minutes || 30,
            existing[0].id
          ]);
          updatedCount++;
        } else {
          // Create new
          await sql(`
            INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, 
              block2_entry_time, block2_exit_time, shift_type, lunch_break_minutes, tenant_id)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            s.name, s.entry_time, s.exit_time, s.tolerance_minutes || 10,
            s.block2_entry_time || null, s.block2_exit_time || null,
            s.shift_type || 'fixed', s.lunch_break_minutes || 30,
            tenant.id
          ]);
          createdCount++;
        }
      }
    }

    // Bulk assign employees to schedules
    if (assignments && Array.isArray(assignments)) {
      for (const a of assignments) {
        if (!a.employee_rut || !a.schedule_name) {
          errors.push(`Asignación: falta employee_rut o schedule_name`);
          continue;
        }

        // Find employee by RUT
        const rutClean = a.employee_rut.replace(/[.\-\s]/g, '').toLowerCase();
        const [emp] = await sql(
          `SELECT id FROM employees WHERE REPLACE(REPLACE(LOWER(rut), '.', ''), '-', '') = $1 AND tenant_id = $2 AND active = true`,
          [rutClean, tenant.id]
        );

        if (!emp) {
          errors.push(`RUT ${a.employee_rut}: empleado no encontrado`);
          continue;
        }

        // Find schedule by name
        const [schedule] = await sql(
          'SELECT id FROM work_schedules WHERE name = $1 LIMIT 1',
          [a.schedule_name]
        );

        if (!schedule) {
          errors.push(`Turno "${a.schedule_name}": no existe`);
          continue;
        }

        // Upsert assignment
        await sql(`
          INSERT INTO employee_schedules (employee_id, schedule_id, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (employee_id) DO UPDATE SET schedule_id = $2, updated_at = NOW()
        `, [emp.id, schedule.id]);
        assignedCount++;
      }
    }

    return res.status(200).json({
      ok: true,
      schedules_created: createdCount,
      schedules_updated: updatedCount,
      employees_assigned: assignedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
