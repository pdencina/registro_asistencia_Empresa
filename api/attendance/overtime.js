const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * GET /api/attendance/overtime
 * Calcula horas extra por colaborador en un rango de fechas.
 * 
 * Query params:
 *   - start_date (required): fecha inicio YYYY-MM-DD
 *   - end_date (required): fecha fin YYYY-MM-DD
 *   - employee_id (optional): filtrar por un colaborador
 * 
 * Lógica:
 * - Si el trabajador tiene horario asignado, horas extra = tiempo trabajado - jornada
 * - Si no tiene horario, usa jornada por defecto (9 hrs = 08:30-18:00, con 30 min colación)
 * - Horas extra = minutos trabajados que exceden la jornada diaria
 * - Solo cuenta días con entrada Y salida registrada
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const { start_date, end_date, employee_id } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date y end_date son obligatorios' });
  }

  try {
    // Obtener horario por defecto del tenant
    let defaultSchedule = { entry_time: '08:30', exit_time: '18:00', daily_minutes: 510 }; // 8.5 hrs
    try {
      const schedules = await sql(
        "SELECT * FROM work_schedules WHERE is_default = true LIMIT 1"
      );
      if (schedules.length > 0) {
        const s = schedules[0];
        const entryParts = s.entry_time.split(':');
        const exitParts = s.exit_time.split(':');
        const entryMin = parseInt(entryParts[0]) * 60 + parseInt(entryParts[1]);
        const exitMin = parseInt(exitParts[0]) * 60 + parseInt(exitParts[1]);
        defaultSchedule = {
          entry_time: s.entry_time,
          exit_time: s.exit_time,
          daily_minutes: exitMin - entryMin - 30, // Resta 30 min colación
        };
      }
    } catch (e) {}

    // Query: obtener todos los registros en el rango
    let query = `
      SELECT 
        ar.employee_id,
        e.first_name, e.last_name, e.rut, e.department,
        date(ar.timestamp AT TIME ZONE $1) as work_date,
        ar.type,
        ar.timestamp
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.tenant_id = $2
        AND date(ar.timestamp AT TIME ZONE $1) >= $3
        AND date(ar.timestamp AT TIME ZONE $1) <= $4
    `;
    const params = [TZ, tenant.id, start_date, end_date];
    let paramIdx = 5;

    if (employee_id) {
      query += ` AND ar.employee_id = $${paramIdx++}`;
      params.push(employee_id);
    }

    query += ' ORDER BY ar.employee_id, ar.timestamp';

    const records = await sql(query, params);

    // Agrupar por empleado y día
    const byEmployee = {};
    for (const record of records) {
      const key = record.employee_id;
      if (!byEmployee[key]) {
        byEmployee[key] = {
          employee_id: record.employee_id,
          first_name: record.first_name,
          last_name: record.last_name,
          rut: record.rut,
          department: record.department,
          days: {},
        };
      }
      const dateKey = record.work_date;
      if (!byEmployee[key].days[dateKey]) {
        byEmployee[key].days[dateKey] = { entries: [], exits: [] };
      }
      if (record.type === 'entry') {
        byEmployee[key].days[dateKey].entries.push(record.timestamp);
      } else {
        byEmployee[key].days[dateKey].exits.push(record.timestamp);
      }
    }

    // Calcular horas extra por empleado
    const results = [];

    for (const empId of Object.keys(byEmployee)) {
      const emp = byEmployee[empId];
      let totalOvertimeMinutes = 0;
      let totalWorkedMinutes = 0;
      let daysWorked = 0;
      const dailyDetail = [];

      for (const dateKey of Object.keys(emp.days)) {
        const day = emp.days[dateKey];
        if (day.entries.length === 0 || day.exits.length === 0) continue;

        // Tomar primera entrada y última salida del día
        const firstEntry = new Date(day.entries[0]);
        const lastExit = new Date(day.exits[day.exits.length - 1]);

        // Calcular minutos trabajados
        const workedMinutes = Math.round((lastExit - firstEntry) / 60000);
        // Restar 30 min de colación si trabajó más de 5 horas
        const effectiveWorked = workedMinutes > 300 ? workedMinutes - 30 : workedMinutes;

        // HORAS EXTRA: solo cuenta tiempo DESPUÉS de la hora de salida programada
        // Llegar temprano NO genera horas extra
        const exitTimeParts = defaultSchedule.exit_time.split(':');
        const scheduledExitMinutes = parseInt(exitTimeParts[0]) * 60 + parseInt(exitTimeParts[1]);

        // Convertir la hora de salida real a minutos desde medianoche (timezone local)
        const exitLocal = new Date(lastExit.toLocaleString('en-US', { timeZone: TZ }));
        const actualExitMinutes = exitLocal.getHours() * 60 + exitLocal.getMinutes();

        // Solo hay hora extra si salió DESPUÉS de la hora programada
        const overtime = Math.max(0, actualExitMinutes - scheduledExitMinutes);

        // Hora de entrada real para detectar puntualidad/llegada temprana
        const entryTimeParts = defaultSchedule.entry_time.split(':');
        const scheduledEntryMinutes = parseInt(entryTimeParts[0]) * 60 + parseInt(entryTimeParts[1]);
        const entryLocal = new Date(firstEntry.toLocaleString('en-US', { timeZone: TZ }));
        const actualEntryMinutes = entryLocal.getHours() * 60 + entryLocal.getMinutes();
        const arrivedEarly = actualEntryMinutes < scheduledEntryMinutes;
        const minutesEarly = arrivedEarly ? scheduledEntryMinutes - actualEntryMinutes : 0;

        totalWorkedMinutes += effectiveWorked;
        totalOvertimeMinutes += overtime;
        daysWorked++;

        if (overtime > 0) {
          dailyDetail.push({
            date: dateKey,
            entry: firstEntry.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
            exit: lastExit.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
            worked_minutes: effectiveWorked,
            overtime_minutes: overtime,
            reason: 'post_exit', // Solo por quedarse después
          });
        }

        // Registrar llegada temprana (para bono puntualidad)
        if (arrivedEarly) {
          if (!emp.early_days) emp.early_days = [];
          emp.early_days.push({
            date: dateKey,
            entry: firstEntry.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
            minutes_early: minutesEarly,
          });
        }
      }

      results.push({
        employee_id: emp.employee_id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        rut: emp.rut,
        department: emp.department,
        days_worked: daysWorked,
        total_worked_hours: Math.floor(totalWorkedMinutes / 60),
        total_worked_minutes: totalWorkedMinutes % 60,
        total_overtime_hours: Math.floor(totalOvertimeMinutes / 60),
        total_overtime_minutes: totalOvertimeMinutes % 60,
        overtime_days: dailyDetail,
        early_arrival_days: emp.early_days || [],
        early_arrival_count: (emp.early_days || []).length,
      });
    }

    // Ordenar por más horas extra
    results.sort((a, b) => (b.total_overtime_hours * 60 + b.total_overtime_minutes) - (a.total_overtime_hours * 60 + a.total_overtime_minutes));

    // Punctuality bonus: employees sorted by most early arrivals
    const punctualityRanking = [...results]
      .filter(r => r.early_arrival_count > 0)
      .sort((a, b) => b.early_arrival_count - a.early_arrival_count);

    return res.status(200).json({
      period: { start_date, end_date },
      schedule: defaultSchedule,
      summary: {
        total_employees: results.length,
        employees_with_overtime: results.filter(r => r.total_overtime_hours > 0 || r.total_overtime_minutes > 0).length,
        employees_always_punctual: results.filter(r => r.early_arrival_count > 0 && r.total_overtime_hours === 0 && r.total_overtime_minutes === 0).length,
        total_early_arrivals: results.reduce((sum, r) => sum + r.early_arrival_count, 0),
      },
      note: 'Las horas extra solo se calculan cuando el colaborador permanece DESPUÉS de la hora de salida programada. Llegar temprano NO genera horas extra.',
      employees: results,
      punctuality_ranking: punctualityRanking,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
