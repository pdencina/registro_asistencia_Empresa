import { neon } from '@neondatabase/serverless';
const sql = neon(process.argv[2] || process.env.DATABASE_URL);

async function main() {
  const [t] = await sql`SELECT id, name FROM tenants WHERE slug = 'pi-berries'`;
  if (!t) { console.log('No existe pi-berries'); return; }
  console.log('Tenant:', t.name, t.id);
  const devs = await sql`SELECT device_id, name, lat, lng, active FROM authorized_devices WHERE tenant_id = ${t.id}`;
  console.log('Dispositivos:', devs.length);
  devs.forEach(d => console.log(' -', d.name, '| lat:', d.lat, 'lng:', d.lng, '| activo:', d.active));
}
main().catch(e => console.error(e.message));
