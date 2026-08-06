const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { verifyChainIntegrity } = require('../lib/integrity');

/**
 * GET /api/attendance/fiscalizacion
 * 
 * Endpoint de acceso para fiscalizadores de la Dirección del Trabajo.
 * Permite consultar el Libro de Asistencia y verificar integridad
 * sin necesidad de autenticación del tenant (usa token de fiscalización).
 * 
 * Autenticación: Header "x-dt-token" con token generado por el admin
 * del tenant desde el panel de configuración.
 * 
 * Query params:
 *   - tenant_slug (required): identificador de la empresa
 *   - start_date (required): YYYY-MM-DD
 *   - end_date (required): YYYY-MM-DD
 *   - format: 'libro' (default) | 'integrity' | 'resumen'
 * 
 * Resolución 38 Exenta — Acceso permanente para fiscalización.
 */

const TZ = 'America/Santiago';

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method === 'POST') {
    return handleGenerateToken(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    // Autenticación por token DT
    const dtToken = req.headers['x-dt-token'];
    const { tenant_slug, start_date, end_date, format = 'libro' } = req.query;

    if (!dtToken) {
      return res.status(401).json({ error: 'Token de fiscalización requerido (header x-dt-token)' });
    }

    if (!tenant_slug) {
      return res.status(400).json({ error: 'tenant_slug es obligatorio' });
    }

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date y end_date son obligatorios' });
    }

    // Buscar tenant por slug
    const [tenant] = await sql(
      'SELECT id, name, slug, rut_empresa, admin_email FROM tenants WHERE slug = $1 AND active = true',
      [tenant_slug]
    );

    if (!tenant) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Verificar token de fiscalización
    await sql('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dt_fiscalizacion_token VARCHAR(100)');
    await sql('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dt_token_created_at TIMESTAMP');
    await sql('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dt_token_expires_at TIMESTAMP');

    const [tenantWithToken] = await sql(
      'SELECT dt_fiscalizacion_token, dt_token_expires_at FROM tenants WHERE id = $1',
      [tenant.id]
    );

    if (!tenantWithToken || !tenantWithToken.dt_fiscalizacion_token) {
      return res.status(403).json({ error: 'Esta empresa no tiene token de fiscalización activo. El administrador debe generarlo.' });
    }

    if (dtToken !== tenantWithToken.dt_fiscalizacion_token) {
      return res.status(401).json({ error: 'Token de fiscalización inválido' });
    }

    // Verificar expiración (token válido por 90 días)
    if (tenantWithToken.dt_token_expires_at && new Date(tenantWithToken.dt_token_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Token de fiscalización expirado. El administrador debe generar uno nuevo.' });
    }

    // --- FORMATO: Verificación de integridad ---
    if (format === 'integrity') {
      const result = await verifyChainIntegrity(tenant.id, {
        startDate: start_date,
        endDate: end_date,
      });

      return res.status(200).json({
        empresa: { nombre: tenant.name, rut: tenant.rut_empresa, slug: tenant.slug },
        periodo: { start_date, end_date },
        verificacion: result,
        verificado_at: new Date().toISOString(),
        nota: 'Verificación de integridad de cadena de registros (hash SHA-256 encadenado)',
      });
    }

    // --- FORMATO: Resumen estadístico ---
    if (format === 'resumen') {
      const employees = await sql(
        'SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND active = true',
        [tenant.id]
      );

      const totalRecords = await sql(`
        SELECT COUNT(*) as count FROM attendance_records
        WHERE tenant_id = $1 AND date(timestamp AT TIME ZONE $2) >= $3 AND date(timestamp AT TIME ZONE $2) <= $4
      `, [tenant.id, TZ, start_date, end_date]);

      const methodBreakdown = await sql(`
        SELECT method, COUNT(*) as count FROM attendance_records
        WHERE tenant_id = $1 AND date(timestamp AT TIME ZONE $2) >= $3 AND date(timestamp AT TIME ZONE $2) <= $4
        GROUP BY method
      `, [tenant.id, TZ, start_date, end_date]);

      return res.status(200).json({
        empresa: { nombre: tenant.name, rut: tenant.rut_empresa, slug: tenant.slug },
        periodo: { start_date, end_date },
        resumen: {
          total_empleados_activos: Number(employees[0].count),
          total_registros_periodo: Number(totalRecords[0].count),
          metodos_marcacion: methodBreakdown.map(m => ({ metodo: m.method, cantidad: Number(m.count) })),
        },
        generado_at: new Date().toISOString(),
      });
    }

    // --- FORMATO: Libro de Asistencia (default) ---
    const employees = await sql(
      'SELECT id, first_name, last_name, rut, department, position FROM employees WHERE tenant_id = $1 AND active = true ORDER BY last_name, first_name',
      [tenant.id]
    );

    const records = await sql(`
      SELECT 
        employee_id, type, method, latitude, longitude,
        to_char(timestamp AT TIME ZONE $1, 'YYYY-MM-DD') as record_date,
        to_char(timestamp AT TIME ZONE $1, 'HH24:MI') as record_time,
        record_hash
      FROM attendance_records
      WHERE tenant_id = $2
        AND date(timestamp AT TIME ZONE $1) >= $3
        AND date(timestamp AT TIME ZONE $1) <= $4
      ORDER BY timestamp
    `, [TZ, tenant.id, start_date, end_date]);

    // Agrupar por empleado y día
    const byEmployeeDay = {};
    for (const r of records) {
      const key = `${r.employee_id}|${r.record_date}`;
      if (!byEmployeeDay[key]) {
        byEmployeeDay[key] = { employee_id: r.employee_id, date: r.record_date, entries: [], exits: [], method: r.method, hashes: [] };
      }
      if (r.type === 'entry') byEmployeeDay[key].entries.push(r.record_time);
      else byEmployeeDay[key].exits.push(r.record_time);
      byEmployeeDay[key].hashes.push(r.record_hash);
      if (r.latitude) byEmployeeDay[key].location = { lat: r.latitude, lng: r.longitude };
    }

    // Generar días hábiles
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

    // Construir libro
    const libro = [];
    for (const emp of employees) {
      for (const day of workingDays) {
        const key = `${emp.id}|${day}`;
        const dayData = byEmployeeDay[key];

        const entry = dayData?.entries[0] || null;
        const exit = dayData?.exits[dayData.exits.length - 1] || null;

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

        const methods = { visual: 'Reconocimiento Facial', pin: 'PIN Personal', mobile: 'Marcaje Móvil' };
        const metodo = dayData?.method ? (methods[dayData.method] || dayData.method) : '—';

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
          ubicacion: dayData?.location || null,
          hash_integridad: dayData?.hashes?.[0] || null,
          observacion,
        });
      }
    }

    return res.status(200).json({
      empresa: {
        nombre: tenant.name,
        rut: tenant.rut_empresa || '',
        slug: tenant.slug,
        contacto: tenant.admin_email,
      },
      periodo: { start_date, end_date },
      total_empleados: employees.length,
      total_dias_habiles: workingDays.length,
      total_registros: libro.length,
      nota_legal: 'Libro de Asistencia conforme al Artículo 33 del Código del Trabajo. Registro electrónico con validación biométrica facial y/o PIN personal. Datos protegidos con hash SHA-256 encadenado. Conservar por 5 años.',
      sistema: {
        nombre: 'Flexio',
        version: '2.1.0',
        url: 'https://flexio.cl',
      },
      generado_at: new Date().toISOString(),
      registros: libro,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/attendance/fiscalizacion
 * Genera un nuevo token de fiscalización para el tenant.
 * Requiere autenticación del admin (PIN o token de sesión).
 * 
 * Body: { pin }
 * Header: x-tenant-slug
 * 
 * El token generado es válido por 90 días.
 */
async function handleGenerateToken(req, res) {
  const sql = getDb();
  const { requireTenant } = require('../lib/tenant');
  const { verifyPin } = require('../lib/hash');

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ error: 'PIN de administrador es obligatorio' });
  }

  // Verificar PIN del admin
  if (!verifyPin(pin, tenant.admin_pin_hash)) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  // Generar token seguro
  const { randomBytes } = require('crypto');
  const token = `dt_${randomBytes(32).toString('hex')}`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  // Asegurar columnas
  await sql('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dt_fiscalizacion_token VARCHAR(100)');
  await sql('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dt_token_created_at TIMESTAMP');
  await sql('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS dt_token_expires_at TIMESTAMP');

  // Guardar token
  await sql(
    'UPDATE tenants SET dt_fiscalizacion_token = $1, dt_token_created_at = NOW(), dt_token_expires_at = $2, updated_at = NOW() WHERE id = $3',
    [token, expiresAt.toISOString(), tenant.id]
  );

  return res.status(200).json({
    token,
    expires_at: expiresAt.toISOString(),
    valid_days: 90,
    instructions: {
      endpoint: '/api/attendance/fiscalizacion',
      method: 'GET',
      headers: { 'x-dt-token': token },
      params: {
        tenant_slug: tenant.slug,
        start_date: 'YYYY-MM-DD',
        end_date: 'YYYY-MM-DD',
        format: 'libro | integrity | resumen',
      },
      ejemplo: `curl -H "x-dt-token: ${token}" "https://flexio.cl/api/attendance/fiscalizacion?tenant_slug=${tenant.slug}&start_date=2026-01-01&end_date=2026-01-31"`,
    },
    message: `Token de fiscalización generado. Válido hasta ${expiresAt.toLocaleDateString('es-CL')}. Entregue este token al fiscalizador de la DT.`,
  });
}
