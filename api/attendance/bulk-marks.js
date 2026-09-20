const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireAuth } = require('../lib/auth');
const { logAudit, auditContext } = require('../lib/auditLog');
const { insertAttendanceRecord } = require('../lib/integrity');

// Las marcas importadas también entran a la cadena de integridad (antes se insertaban sin hash ni sello)
function insertImported(tenantId, employeeId, type, timestampText, notes) {
  return insertAttendanceRecord({
    id: require('crypto').randomUUID(),
    tenant_id: tenantId,
    employee_id: employeeId,
    type,
    timestamp: new Date(timestampText).toISOString(),
    method: 'manual_import',
    notes,
    channel: 'IMPORT',
    auth_method: 'OTHER',
    auth_result: 'ADMIN_IMPORT',
  });
}

/**
 * POST /api/attendance/bulk-marks
 * 
 * Bulk import of manual attendance marks from CSV/Excel data.
 * Used for: loading historical data, correcting multiple records, migration from other systems.
 * 
 * Body: { marks: [{ rut, date, entry_time, exit_time, notes? }] }
 * 
 * Each row creates 1-2 attendance_records (entry and/or exit).
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireAuth(req, res, { roles: ['admin', 'rrhh'] });
  if (!tenant) return;

  const sql = getDb();
  const { marks } = req.body;

  if (!marks || !Array.isArray(marks) || marks.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de marcas' });
  }

  if (marks.length > 1000) {
    return res.status(400).json({ error: 'Máximo 1000 marcas por importación' });
  }

  // Build RUT → employee_id map
  const employees = await sql(
    'SELECT id, rut FROM employees WHERE tenant_id = $1 AND active = true',
    [tenant.id]
  );
  const rutMap = {};
  for (const emp of employees) {
    if (emp.rut) {
      const clean = emp.rut.replace(/[.\-\s]/g, '').toLowerCase();
      rutMap[clean] = emp.id;
    }
  }

  const results = { created: 0, skipped: 0, errors: [] };

  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const row = i + 1;

    // Validate
    if (!mark.rut || !mark.date) {
      results.errors.push({ row, error: 'RUT y fecha son obligatorios' });
      continue;
    }

    // Find employee
    const cleanRut = mark.rut.replace(/[.\-\s]/g, '').toLowerCase();
    const employeeId = rutMap[cleanRut];
    if (!employeeId) {
      results.errors.push({ row, error: `RUT ${mark.rut} no encontrado`, rut: mark.rut });
      results.skipped++;
      continue;
    }

    // Validate date format
    if (!mark.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      results.errors.push({ row, error: `Fecha inválida: ${mark.date}. Formato: YYYY-MM-DD` });
      continue;
    }

    try {
      // Create entry record if entry_time provided
      if (mark.entry_time) {
        const entryTimestamp = `${mark.date}T${normalizeTime(mark.entry_time)}:00`;
        await insertImported(tenant.id, employeeId, 'entry', entryTimestamp, mark.notes || 'Carga masiva');
        results.created++;
      }

      // Create exit record if exit_time provided
      if (mark.exit_time) {
        const exitTimestamp = `${mark.date}T${normalizeTime(mark.exit_time)}:00`;
        await insertImported(tenant.id, employeeId, 'exit', exitTimestamp, mark.notes || 'Carga masiva');
        results.created++;
      }
    } catch (err) {
      results.errors.push({ row, error: err.message });
    }
  }

  // Audit log (actor real desde la sesión)
  await logAudit({
    ...auditContext(req),
    tenant_id: tenant.id,
    action: 'attendance.bulk_import',
    target_type: 'attendance_records',
    details: { total_marks: marks.length, created: results.created, skipped: results.skipped, errors_count: results.errors.length },
  });

  return res.status(200).json({
    ok: true,
    total_rows: marks.length,
    records_created: results.created,
    skipped: results.skipped,
    errors: results.errors.length > 0 ? results.errors.slice(0, 20) : undefined,
    message: `${results.created} registros creados${results.skipped > 0 ? `, ${results.skipped} omitidos` : ''}`,
  });
};

function normalizeTime(time) {
  // Accept "8:30", "08:30", "8:30:00" → "08:30"
  const parts = time.split(':');
  const h = parts[0].padStart(2, '0');
  const m = (parts[1] || '00').padStart(2, '0');
  return `${h}:${m}`;
}
