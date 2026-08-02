const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');

/**
 * POST /api/superadmin/seed-demo
 * Seeds the 'demo' tenant with realistic data for presentations.
 * Requires superadmin auth.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify superadmin
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  const GLOBAL_SECRET = process.env.GLOBAL_ADMIN_SECRET;
  if (!GLOBAL_SECRET) return res.status(500).json({ error: 'Secret not configured' });

  let authorized = false;
  if (token === GLOBAL_SECRET) authorized = true;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    if (decoded.startsWith(GLOBAL_SECRET + ':')) authorized = true;
  } catch {}
  if (!authorized) return res.status(401).json({ error: 'No autorizado' });

  const sql = getDb();

  try {
    // Get or create demo tenant
    let [tenant] = await sql("SELECT id FROM tenants WHERE slug = 'demo'");
    if (!tenant) {
      [tenant] = await sql(`
        INSERT INTO tenants (id, name, slug, admin_email, admin_password, plan, active)
        VALUES (gen_random_uuid(), 'Colegio Demo', 'demo', 'admin@demo.cl', 'demo1234', 'profesional', true)
        RETURNING id
      `);
    }
    const tenantId = tenant.id;

    // Clean existing
    await sql('DELETE FROM attendance_records WHERE tenant_id = $1', [tenantId]);
    await sql('DELETE FROM employees WHERE tenant_id = $1', [tenantId]);

    // Departments and employees
    const departments = [
      { name: 'Docentes', employees: [
        ['Carolina', 'Muñoz', '12.345.678-5', 'Profesora Lenguaje'],
        ['Roberto', 'Fuentes', '13.456.789-0', 'Profesor Matemáticas'],
        ['Andrea', 'Soto', '14.567.890-1', 'Profesora Ciencias'],
        ['Valentina', 'Díaz', '15.678.901-2', 'Profesora Historia'],
        ['Martín', 'López', '16.789.012-3', 'Profesor Inglés'],
        ['Francisca', 'Ramírez', '11.234.567-4', 'Profesora Ed. Física'],
        ['Joaquín', 'Herrera', '10.345.678-5', 'Profesor Arte'],
        ['Catalina', 'Vargas', '9.456.789-6', 'Profesora Música'],
        ['Diego', 'Morales', '17.567.890-7', 'Profesor Tecnología'],
        ['Javiera', 'Torres', '18.678.901-8', 'Profesora 1° Básico'],
        ['Sebastián', 'Rojas', '19.789.012-9', 'Profesor 2° Básico'],
        ['Constanza', 'Silva', '20.890.123-0', 'Profesora 3° Básico'],
        ['Tomás', 'Contreras', '21.901.234-1', 'Profesor 4° Básico'],
        ['Isidora', 'Espinoza', '22.012.345-2', 'Profesora Religión'],
        ['Matías', 'Campos', '23.123.456-3', 'Prof. Ed. Diferencial'],
      ]},
      { name: 'Administración', employees: [
        ['Patricia', 'González', '8.234.567-7', 'Directora'],
        ['Fernando', 'Álvarez', '9.345.678-8', 'Subdirector'],
        ['María José', 'Peña', '10.456.789-9', 'Secretaria Académica'],
        ['Alejandro', 'Vega', '11.567.890-0', 'Jefe Finanzas'],
        ['Claudia', 'Reyes', '12.678.901-1', 'Recepcionista'],
        ['Ricardo', 'Mendoza', '13.789.012-2', 'Contador'],
        ['Lorena', 'Castro', '14.890.123-3', 'RRHH'],
        ['Nicolás', 'Bravo', '15.901.234-4', 'Coord. Académico'],
        ['Daniela', 'Parra', '16.012.345-5', 'Psicóloga'],
        ['Gabriel', 'Figueroa', '17.123.456-6', 'Inspector General'],
      ]},
      { name: 'Auxiliares', employees: [
        ['José', 'Martínez', '7.234.567-8', 'Jefe Mantención'],
        ['Rosa', 'Sepúlveda', '8.345.678-9', 'Auxiliar Aseo'],
        ['Pedro', 'Guzmán', '9.456.789-0', 'Auxiliar Mantención'],
        ['Carmen', 'Flores', '10.567.890-1', 'Auxiliar Aseo'],
        ['Luis', 'Araya', '11.678.901-2', 'Portero'],
        ['Teresa', 'Vergara', '12.789.012-3', 'Auxiliar Cocina'],
        ['Miguel', 'Cortés', '13.890.123-4', 'Jardinero'],
      ]},
      { name: 'Coordinación', employees: [
        ['Soledad', 'Arriagada', '14.901.234-5', 'UTP'],
        ['Andrés', 'Valenzuela', '15.012.345-6', 'Convivencia Escolar'],
        ['Marcela', 'Tapia', '16.123.456-7', 'Extraescolar'],
      ]},
    ];

    const empIds = [];

    for (const dept of departments) {
      for (const [first, last, rut, position] of dept.employees) {
        const [emp] = await sql(`
          INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, email, consent_status, active, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'approved', true, NOW(), NOW())
          RETURNING id
        `, [tenantId, first, last, rut, dept.name, position, `${first.toLowerCase()}@demo.cl`]);
        empIds.push(emp.id);
      }
    }

    // Generate 14 days of attendance (weekdays only)
    let recordsCreated = 0;
    const now = new Date();

    for (let dayOffset = 13; dayOffset >= 0; dayOffset--) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);

      // Skip weekends
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue;

      const dateStr = date.toISOString().split('T')[0];

      for (const empId of empIds) {
        // 88% show up
        if (Math.random() > 0.88) continue;

        // Entry time: varied
        let entryHour, entryMin;
        const entryRoll = Math.random();
        if (entryRoll < 0.65) {
          // On time: 7:50 - 8:08
          entryHour = 7; entryMin = 50 + Math.floor(Math.random() * 18);
          if (entryMin >= 60) { entryHour = 8; entryMin -= 60; }
        } else if (entryRoll < 0.85) {
          // Slightly late: 8:11 - 8:25
          entryHour = 8; entryMin = 11 + Math.floor(Math.random() * 14);
        } else {
          // Late: 8:26 - 9:15
          entryHour = 8; entryMin = 26 + Math.floor(Math.random() * 49);
          if (entryMin >= 60) { entryHour = 9; entryMin -= 60; }
        }

        const entryTime = `${dateStr}T${String(entryHour).padStart(2,'0')}:${String(entryMin).padStart(2,'0')}:00`;

        // Exit time
        let exitHour, exitMin;
        const exitRoll = Math.random();
        if (exitRoll < 0.75) {
          // Normal: 15:45 - 16:30
          exitHour = 15; exitMin = 45 + Math.floor(Math.random() * 45);
          if (exitMin >= 60) { exitHour = 16; exitMin -= 60; }
        } else if (exitRoll < 0.92) {
          // Overtime: 16:31 - 18:00
          exitHour = 16; exitMin = 31 + Math.floor(Math.random() * 89);
          if (exitMin >= 60) { exitHour = 17; exitMin -= 60; }
        } else {
          // Early: 14:30 - 15:44
          exitHour = 14; exitMin = 30 + Math.floor(Math.random() * 74);
          if (exitMin >= 60) { exitHour = 15; exitMin -= 60; }
        }

        const exitTime = `${dateStr}T${String(exitHour).padStart(2,'0')}:${String(exitMin).padStart(2,'0')}:00`;

        // GPS coordinates (Santiago area)
        const lat = (-33.41 - Math.random() * 0.05).toFixed(6);
        const lng = (-70.61 - Math.random() * 0.05).toFixed(6);

        await sql(`
          INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
          VALUES (gen_random_uuid(), $1, $2, 'entry', $3, 'visual', $4)
        `, [tenantId, empId, entryTime, `GPS: ${lat}, ${lng}`]);

        await sql(`
          INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
          VALUES (gen_random_uuid(), $1, $2, 'exit', $3, 'visual', $4)
        `, [tenantId, empId, exitTime, `GPS: ${lat}, ${lng}`]);

        recordsCreated += 2;
      }
    }

    return res.status(200).json({
      ok: true,
      tenant_id: tenantId,
      employees_created: empIds.length,
      records_created: recordsCreated,
      message: `Demo lista: ${empIds.length} colaboradores, ${recordsCreated} registros en 2 semanas. Accede en flexio.cl/admin/demo (admin@demo.cl / demo1234)`,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
