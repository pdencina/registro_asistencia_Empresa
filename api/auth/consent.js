const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const sql = getDb();

  // GET: Obtener datos del empleado por token (para mostrar en la página de consentimiento)
  if (req.method === 'GET') {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    try {
      const [employee] = await sql(`
        SELECT e.id, e.first_name, e.last_name, e.rut, e.department, e.position, e.photo_url, e.consent_status, e.email,
               t.name as tenant_name, t.logo_url as tenant_logo
        FROM employees e
        JOIN tenants t ON e.tenant_id = t.id
        WHERE e.consent_token = $1 AND e.active = true
      `, [token]);

      if (!employee) {
        return res.status(404).json({ error: 'Token inválido o expirado' });
      }

      if (employee.consent_status === 'approved') {
        return res.status(200).json({
          already_approved: true,
          employee: {
            first_name: employee.first_name,
            last_name: employee.last_name,
            tenant_name: employee.tenant_name,
          },
        });
      }

      return res.status(200).json({
        already_approved: false,
        employee: {
          first_name: employee.first_name,
          last_name: employee.last_name,
          rut: employee.rut,
          department: employee.department,
          position: employee.position,
          photo_url: employee.photo_url,
          tenant_name: employee.tenant_name,
          tenant_logo: employee.tenant_logo,
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST: Aprobar o rechazar el consentimiento
  if (req.method === 'POST') {
    const { token, action } = req.body;

    if (!token || !action) {
      return res.status(400).json({ error: 'Token y acción son requeridos' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Acción debe ser "approve" o "reject"' });
    }

    try {
      const [employee] = await sql(
        'SELECT id, consent_status FROM employees WHERE consent_token = $1 AND active = true',
        [token]
      );

      if (!employee) {
        return res.status(404).json({ error: 'Token inválido o expirado' });
      }

      if (employee.consent_status === 'approved') {
        return res.status(409).json({ error: 'El consentimiento ya fue otorgado anteriormente' });
      }

      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida';
      const timestamp = new Date().toISOString();
      const status = action === 'approve' ? 'approved' : 'rejected';

      await sql(`
        UPDATE employees SET
          consent_status = $1,
          consent_at = $2,
          consent_ip = $3,
          updated_at = NOW()
        WHERE consent_token = $4
      `, [status, timestamp, typeof ip === 'string' ? ip.split(',')[0].trim() : 'desconocida', token]);

      return res.status(200).json({
        ok: true,
        status,
        message: status === 'approved'
          ? 'Consentimiento otorgado. Ya puedes usar el reconocimiento facial.'
          : 'Has rechazado el uso de datos biométricos. Podrás marcar asistencia con PIN.',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
