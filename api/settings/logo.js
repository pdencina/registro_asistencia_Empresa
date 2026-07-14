const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  // GET: Obtener logo actual
  if (req.method === 'GET') {
    return res.status(200).json({ logo_url: tenant.logo_url || null });
  }

  // PUT: Subir o actualizar logo
  if (req.method === 'PUT') {
    try {
      const { logo } = req.body;

      if (!logo) {
        return res.status(400).json({ error: 'Se requiere el campo "logo" en base64' });
      }

      // Extraer el tipo de imagen y convertir a buffer
      const matches = logo.match(/^data:image\/(\w+);base64,/);
      const extension = matches ? matches[1] : 'png';
      const buffer = Buffer.from(logo.replace(/^data:image\/\w+;base64,/, ''), 'base64');

      // Subir a Vercel Blob
      const blob = await put(`logos/${tenant.slug}/logo.${extension}`, buffer, {
        access: 'public',
        contentType: `image/${extension}`,
      });

      // Actualizar en la BD
      await sql('UPDATE tenants SET logo_url = $1, updated_at = NOW() WHERE id = $2', [blob.url, tenant.id]);

      return res.status(200).json({ logo_url: blob.url, message: 'Logo actualizado' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE: Quitar logo
  if (req.method === 'DELETE') {
    try {
      await sql('UPDATE tenants SET logo_url = NULL, updated_at = NOW() WHERE id = $1', [tenant.id]);
      return res.status(200).json({ message: 'Logo eliminado' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
