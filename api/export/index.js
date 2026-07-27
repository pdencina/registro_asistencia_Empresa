const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * GET /api/export
 * Full data export for the tenant — all employees, attendance records, schedules, etc.
 * Used for: data portability (Ley 21.719), backup, migration.
 * 
 * Returns a JSON blob with all tenant data.
 * Query: ?format=json (default) — future: csv, xlsx
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    // Employees
    const employees = await sql(
      `SELECT id, first_name, last_name, rut, email, phone, department, position, 
              consent_status, active, created_at, updated_at
       FROM employees WHERE tenant_id = $1 ORDER BY last_name, first_name`,
      [tenant.id]
    );

    // Attendance records
    const records = await sql(
      `SELECT id, employee_id, type, timestamp, method, notes, photo_snapshot_url, created_at
       FROM attendance_records WHERE tenant_id = $1 ORDER BY timestamp DESC`,
      [tenant.id]
    );

    // Schedules
    const schedules = await sql(
      'SELECT * FROM work_schedules WHERE tenant_id = $1 OR tenant_id IS NULL ORDER BY name',
      [tenant.id]
    ).catch(() => []);

    // Employee schedule assignments
    const assignments = await sql(
      `SELECT es.employee_id, ws.name as schedule_name, es.custom_entry_time, es.custom_exit_time
       FROM employee_schedules es
       JOIN work_schedules ws ON es.schedule_id = ws.id
       JOIN employees e ON es.employee_id = e.id
       WHERE e.tenant_id = $1`,
      [tenant.id]
    ).catch(() => []);

    // Justifications
    const justifications = await sql(
      'SELECT * FROM justifications WHERE tenant_id = $1 ORDER BY date DESC',
      [tenant.id]
    ).catch(() => []);

    // Warnings
    const warnings = await sql(
      'SELECT id, employee_id, type, reason, infraction_count, period_start, period_end, status, created_at FROM employee_warnings WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenant.id]
    ).catch(() => []);

    // Medical leaves
    const medicalLeaves = await sql(
      'SELECT * FROM medical_leaves WHERE tenant_id = $1 ORDER BY start_date DESC',
      [tenant.id]
    ).catch(() => []);

    // Leave requests
    const leaveRequests = await sql(
      'SELECT * FROM leave_requests WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenant.id]
    ).catch(() => []);

    // Audit log (last 500)
    const auditLog = await sql(
      'SELECT * FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 500',
      [tenant.id]
    ).catch(() => []);

    const exportData = {
      export_info: {
        tenant_name: tenant.name,
        tenant_slug: tenant.slug,
        exported_at: new Date().toISOString(),
        flexio_version: '2.0.0',
        total_employees: employees.length,
        total_records: records.length,
      },
      employees,
      attendance_records: records,
      schedules,
      schedule_assignments: assignments,
      justifications,
      warnings,
      medical_leaves: medicalLeaves,
      leave_requests: leaveRequests,
      audit_log: auditLog,
    };

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="flexio-export-${tenant.slug}-${new Date().toISOString().split('T')[0]}.json"`);

    return res.status(200).json(exportData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
