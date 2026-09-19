import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'crypto';
const sql = neon(process.argv[2] || process.env.DATABASE_URL);

async function main() {
  const [t] = await sql`SELECT id FROM tenants WHERE slug = 'pi-berries'`;
  if (!t) { console.log('No existe pi-berries'); return; }

  // Coordenadas aproximadas de Mafil, Valdivia (Fundo Las Tres Marías)
  const lat = -39.6614, lng = -72.9436;

  await sql`
    INSERT INTO authorized_devices (id, tenant_id, device_id, name, lat, lng, active, created_at, updated_at)
    VALUES (${randomUUID()}, ${t.id}, ${'totem-mafil-01'}, ${'Tótem Fundo Las Tres Marías'}, ${lat}, ${lng}, true, NOW(), NOW())
  `;
  console.log('✅ Tótem creado para Pi Berries en Mafil (', lat, lng, ')');
}
main().catch(e => console.error(e.message));
