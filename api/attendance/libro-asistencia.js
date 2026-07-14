const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * GET /api/attendance/libro-asistencia
 * Genera el Libro de Asistencia en formato compatible con fiscalización DT.
 * 
 * Query params:
 *   - start_date (required): YYYY-MM-DD
 *   - end_date (required): YYYY-MM-DD
 * 
 * Retorna un array de registros diarios por empleado, con:
 * - Fecha, Nombre, RUT, Hora Entrada, Hora Salida, Método, Horas Trabajadas, Observaciones
 * 
 * Cumple Art. 33 Código del Trabajo de Chile.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date y end_date son obligatorios' });
  }

  try {
    // Get all employees
    const employees = await sql(
      'SELECT id, first_name, last_name, rut, department, position FROM employees WHERE tenant_id = $1 AND active = true ORDER BY last_name, first_name',
      [tenant.id]
    );

    // Get all attendance records in period
    const records = await sql(`
      SELECT 
        employee_id,
        type,
        method,
        to_char(timestamp AT TIME ZONE $1, 'YYYY-MM-DD') as record_date,
        to_char(timestamp AT TIME ZONE $1, 'HH24:MI') as record_time,
        timestamp
      FROM attendance_records
      WHERE tenant_id = $2
        AND date(timestamp AT TIME ZONE $1) >= $3
        AND date(timestamp AT TIME ZONE $1) <= $4
      ORDER BY timestamp
    `, [TZ, tenant.id, start_date, end_date]);

    // Group records by employee and day
    const byEmployeeDay = {};
    for (const r of records) {
      const key = `${r.employee_id}|${r.record_date}`;
      if (!byEmployeeDay[key]) {
        byEmployeeDay[key] = { employee_id: r.employee_id, date: r.record_date, entries: [], exits: [], method: r.method };
      }
      if (r.type === 'entry') {
        byEmployeeDay[key].entries.push(r.record_time);
      } else {
        byEmployeeDay[key].exits.push(r.record_time);
      }
    }

    // Generate working days in range
    const workingDays = [];
    const current = new Date(start_date + 'T12:00:00');
    const endD = new Date(end_date + 'T12:00:00');
    const today = new Date(); today.setHours(12, 0, 0, 0);
    while (current <= endD && current <= today) {
      const dow = current.getDay();
      if (dow >= 1 && dow <= 5) {
        workingDays.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);
    }

    // Build the libro de asistencia
    const libro = [];

    for (const emp of employees) {
      for (const day of workingDays) {
        const key = `${emp.id}|${day}`;
        const dayData = byEmployeeDay[key];

        const entry = dayData?.entries[0] || null;
        const exit = dayData?.exits[dayData.exits.length - 1] || null;

        // Calculate hours worked
        let hoursWorked = '';
        if (entry && exit) {
          const [eh, em] = entry.split(':').map(Number);
          const [xh, xm] = exit.split(':').map(Number);
          const totalMin = (xh * 60 + xm) - (eh * 60 + em);
          if (totalMin > 0) {
            const h = Math.floor(totalMin / 60);
            const m = totalMin % 60;
            hoursWorked = `${h}:${String(m).padStart(2, '0')}`;
          }
        }

        // Method label
        let metodo = '—';
        if (dayData?.method) {
          const methods = { visual: 'Reconocimiento Facial', pin: 'PIN Personal', mobile: 'Marcaje Móvil' };
          metodo = methods[dayData.method] || dayData.method;
        }

        // Observation
        let observacion = '';
        if (!entry && !exit) observacion = 'AUSENTE';
        else if (entry && !exit) observacion = 'Sin registro de salida';
        else if (!entry && exit) observacion = 'Sin registro de entrada';

        libro.push({
          fecha: day,
          dia: new Date(day + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long' }),
          rut: emp.rut,
          nombre: `${emp.last_name}, ${emp.first_name}`,
          departamento: emp.department || '',
          cargo: emp.position || '',
          hora_entrada: entry || '—',
          hora_salida: exit || '—',
          horas_trabajadas: hoursWorked || '—',
          metodo_validacion: entry ? metodo : '—',
          observacion,
        });
      }
    }

    return res.status(200).json({
      empresa: {
        nombre: tenant.name,
        rut: tenant.rut_empresa || '',
      },
      periodo: { start_date, end_date },
      total_empleados: employees.length,
      total_dias_habiles: workingDays.length,
      total_registros: libro.length,
      nota_legal: 'Libro de Asistencia conforme al Artículo 33 del Código del Trabajo. Registro electrónico con validación biométrica facial. Conservar por 5 años.',
      registros: libro,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
