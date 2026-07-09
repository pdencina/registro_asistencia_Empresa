const { getDb } = require('../../lib/db');
const { corsHeaders, handleCors } = require('../../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { id } = req.query;
  const sql = getDb();

  try {
    if (req.method === 'DELETE') {
      // Verify record exists
      const [record] = await sql('SELECT * FROM attendance_records WHERE id = $1', [id]);
      if (!record) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }

      await sql('DELETE FROM attendance_records WHERE id = $1', [id]);

      return res.status(200).json({ message: 'Registro eliminado', deleted: record });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
