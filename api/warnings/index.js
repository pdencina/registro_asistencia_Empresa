const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * /api/warnings
 * GET: List warnings + employees with infractions above threshold
 * POST: Create a warning for an employee
 * DELETE: Remove a warning
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  // Ensure table exists
  await sql(`
    CREATE TABLE IF NOT EXISTS employee_warnings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      employee_id UUID NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'tardiness',
      reason TEXT NOT NULL,
      infraction_count INTEGER DEFAULT 0,
      period_start DATE,
      period_end DATE,
      letter_html TEXT,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      notified_at TIMESTAMP,
      acknowledged_at TIMESTAMP
    )
  `);

  // GET: List warnings + detect employees needing warnings
  if (req.method === 'GET') {
    const { period = 'month', threshold = '3', employee_id } = req.query;
    const tardyThreshold = parseInt(threshold);

    // Calculate period dates
    const now = new Date();
    let startDate, endDate;
    if (period === 'week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
    } else if (period === 'trimester') {
      const currentMonth = now.getMonth();
      const trimesterStart = currentMonth - (currentMonth % 3);
      startDate = new Date(now.getFullYear(), trimesterStart, 1).toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
    } else {
      // month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
    }

    // Get tardiness data for the period (excluding justified days)
    const tardyQuery = `
      SELECT 
        ar.employee_id,
        e.first_name, e.last_name, e.rut, e.department, e.position,
        COUNT(*) as tardy_count
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      JOIN work_schedules ws ON ws.tenant_id = ar.tenant_id
      WHERE ar.tenant_id = $1
        AND ar.type = 'entry'
        AND date(ar.timestamp AT TIME ZONE $2) >= $3
        AND date(ar.timestamp AT TIME ZONE $2) <= $4
        AND e.active = true
        AND EXTRACT(HOUR FROM (ar.timestamp AT TIME ZONE $2)) * 60 + EXTRACT(MINUTE FROM (ar.timestamp AT TIME ZONE $2))
            > EXTRACT(HOUR FROM ws.entry_time::time) * 60 + EXTRACT(MINUTE FROM ws.entry_time::time) + COALESCE(ws.tolerance_minutes, 10)
        AND NOT EXISTS (
          SELECT 1 FROM justifications j 
          WHERE j.employee_id = ar.employee_id 
            AND j.tenant_id = ar.tenant_id
            AND j.date = date(ar.timestamp AT TIME ZONE $2)
        )
      GROUP BY ar.employee_id, e.first_name, e.last_name, e.rut, e.department, e.position
      HAVING COUNT(*) >= $5
      ORDER BY COUNT(*) DESC
    `;

    let infractions = [];
    try {
      infractions = await sql(tardyQuery, [tenant.id, TZ, startDate, endDate, tardyThreshold]);
    } catch (e) {
      // If work_schedules table doesn't exist or query fails, return empty
      console.warn('Tardiness query failed:', e.message);
    }

    // Get existing warnings
    let warnings = [];
    if (employee_id) {
      warnings = await sql(
        'SELECT * FROM employee_warnings WHERE tenant_id = $1 AND employee_id = $2 ORDER BY created_at DESC',
        [tenant.id, employee_id]
      );
    } else {
      warnings = await sql(
        'SELECT * FROM employee_warnings WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100',
        [tenant.id]
      );
    }

    // Count warnings per employee
    const warningCounts = {};
    for (const w of warnings) {
      warningCounts[w.employee_id] = (warningCounts[w.employee_id] || 0) + 1;
    }

    return res.status(200).json({
      period: { start: startDate, end: endDate, type: period },
      threshold: tardyThreshold,
      infractions: infractions.map(i => ({
        ...i,
        tardy_count: parseInt(i.tardy_count),
        existing_warnings: warningCounts[i.employee_id] || 0,
        can_terminate: (warningCounts[i.employee_id] || 0) >= 2, // 3rd warning = termination
      })),
      warnings,
    });
  }

  // POST: Create a warning
  if (req.method === 'POST') {
    const { employee_id, type = 'tardiness', reason, infraction_count, period_start, period_end } = req.body;

    if (!employee_id || !reason) {
      return res.status(400).json({ error: 'employee_id y reason son requeridos' });
    }

    // Get employee and tenant info for the letter
    const [employee] = await sql(
      'SELECT e.*, t.name as tenant_name, t.logo_url as tenant_logo FROM employees e JOIN tenants t ON e.tenant_id = t.id WHERE e.id = $1 AND e.tenant_id = $2',
      [employee_id, tenant.id]
    );

    if (!employee) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    // Count existing warnings for this employee
    const existingCount = await sql(
      'SELECT COUNT(*) as count FROM employee_warnings WHERE employee_id = $1 AND tenant_id = $2',
      [employee_id, tenant.id]
    );
    const warningNumber = parseInt(existingCount[0]?.count || 0) + 1;

    // Generate letter HTML
    const letterHtml = generateWarningLetter({
      employee,
      tenant,
      warningNumber,
      type,
      reason,
      infractionCount: infraction_count || 0,
      periodStart: period_start,
      periodEnd: period_end,
    });

    const [warning] = await sql(`
      INSERT INTO employee_warnings (tenant_id, employee_id, type, reason, infraction_count, period_start, period_end, letter_html)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [tenant.id, employee_id, type, reason, infraction_count || 0, period_start || null, period_end || null, letterHtml]);

    return res.status(201).json({
      ...warning,
      warning_number: warningNumber,
      can_terminate: warningNumber >= 3,
    });
  }

  // DELETE: Remove a warning
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });
    await sql('DELETE FROM employee_warnings WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

function generateWarningLetter({ employee, tenant, warningNumber, type, reason, infractionCount, periodStart, periodEnd }) {
  const today = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });
  const typeLabels = {
    tardiness: 'Atrasos reiterados',
    absence: 'Inasistencias injustificadas',
    early_exit: 'Abandono anticipado del puesto',
    other: 'Incumplimiento de obligaciones laborales',
  };
  const typeLabel = typeLabels[type] || typeLabels.other;

  const periodText = periodStart && periodEnd
    ? `durante el período ${new Date(periodStart).toLocaleDateString('es-CL', { timeZone: TZ })} al ${new Date(periodEnd).toLocaleDateString('es-CL', { timeZone: TZ })}`
    : 'en el período reciente';

  const severityText = warningNumber >= 3
    ? 'Esta constituye la <strong>tercera amonestación</strong>, lo que faculta al empleador para poner término al contrato de trabajo por la causal del artículo 160 N°7 del Código del Trabajo (incumplimiento grave de las obligaciones que impone el contrato).'
    : warningNumber === 2
    ? 'Esta es su <strong>segunda amonestación</strong>. De persistir en la conducta, se procederá con la desvinculación conforme a la normativa laboral vigente.'
    : 'Se le insta a corregir esta conducta de manera inmediata. De persistir, se aplicarán las sanciones correspondientes conforme al Reglamento Interno y la legislación laboral.';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'Times New Roman', serif; margin: 40px 60px; color: #111; line-height: 1.6; font-size: 14px; }
  .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px; }
  .header img { max-height: 60px; margin-bottom: 10px; }
  .header h1 { font-size: 18px; margin: 5px 0; text-transform: uppercase; letter-spacing: 2px; }
  .header p { font-size: 12px; color: #555; margin: 2px 0; }
  .title { text-align: center; font-size: 16px; font-weight: bold; margin: 30px 0 20px; text-transform: uppercase; text-decoration: underline; }
  .info-box { background: #f9f9f9; border: 1px solid #ddd; padding: 15px; margin: 20px 0; }
  .info-box p { margin: 4px 0; }
  .body-text { text-align: justify; margin: 15px 0; }
  .signature { margin-top: 60px; }
  .signature-line { border-top: 1px solid #333; width: 250px; margin-top: 50px; padding-top: 5px; }
  .footer { margin-top: 40px; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 10px; }
  @media print { body { margin: 20mm; } }
</style></head>
<body>
  <div class="header">
    ${employee.tenant_logo ? `<img src="${employee.tenant_logo}" alt="${employee.tenant_name}">` : ''}
    <h1>${employee.tenant_name || tenant.name}</h1>
    <p>RUT: ${tenant.rut || '(RUT Empresa)'}</p>
  </div>

  <div class="title">Carta de Amonestación N° ${warningNumber}</div>

  <p style="text-align:right;">Santiago, ${today}</p>

  <div class="info-box">
    <p><strong>Colaborador:</strong> ${employee.first_name} ${employee.last_name}</p>
    <p><strong>RUT:</strong> ${employee.rut || '(sin RUT registrado)'}</p>
    <p><strong>Cargo:</strong> ${employee.position || employee.department || 'Colaborador'}</p>
    <p><strong>Departamento:</strong> ${employee.department || '-'}</p>
  </div>

  <p class="body-text">
    Por medio de la presente, se deja constancia formal que el/la colaborador(a) individualizado(a) anteriormente ha incurrido en <strong>${typeLabel}</strong> ${periodText}.
  </p>

  <p class="body-text">
    <strong>Detalle de la infracción:</strong> ${reason}
  </p>

  ${infractionCount > 0 ? `<p class="body-text">Se registran <strong>${infractionCount} ${type === 'tardiness' ? 'atrasos' : type === 'absence' ? 'inasistencias' : 'infracciones'}</strong> en el período señalado.</p>` : ''}

  <p class="body-text">${severityText}</p>

  <p class="body-text">
    Se deja copia de la presente en la carpeta personal del trabajador.
  </p>

  <div class="signature">
    <div style="display:flex;justify-content:space-between;">
      <div>
        <div class="signature-line">
          <p><strong>Empleador / Representante</strong></p>
          <p>${employee.tenant_name || tenant.name}</p>
        </div>
      </div>
      <div>
        <div class="signature-line">
          <p><strong>Trabajador(a)</strong></p>
          <p>${employee.first_name} ${employee.last_name}</p>
          <p>RUT: ${employee.rut || ''}</p>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>Documento generado por Flexio (flexio.cl) · ${today}</p>
    <p>Este documento tiene validez ante la Dirección del Trabajo conforme al artículo 154 N°10 del Código del Trabajo.</p>
  </div>
</body></html>`;
}
