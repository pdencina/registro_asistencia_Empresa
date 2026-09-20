# Flexio — Control de asistencia

SaaS multi-tenant de control de asistencia para empresas chilenas, en preparación técnica para el proceso de certificación bajo la Resolución Exenta N.º 38 de la Dirección del Trabajo (no está certificado; ver `docs/marcaje-res38/`). Marcaje por tótem (iPad/kiosco) o por móvil, con foto, PIN, RUT o QR, y geolocalización como evidencia.

## Stack

- **Frontend:** React 18, Vite, TailwindCSS, react-router, Recharts, face-api.js, react-webcam
- **Backend:** Vercel Serverless Functions (`api/`, Node, CommonJS)
- **Base de datos:** Neon Postgres (serverless)
- **Archivos:** Vercel Blob (fotos y logos)
- **Correo:** Resend · **Pagos:** MercadoPago (suscripciones)

## Funcionalidades

- **Marcaje:** tótem (`/marcaje/:tenant`) y móvil (`/movil/:tenant`), con foto, PIN/RUT y sello de tiempo
- **Preparación Res. 38 DT (sin certificar):** cadena de hashes SHA-256 por registro con secuencia por empresa (`api/lib/integrity.js`), verificación de integridad, sello de tiempo HMAC, libro de asistencia, reporte de fiscalización, log de auditoría. Plan y estado en `docs/marcaje-res38/`
- **Geolocalización:** registra dónde se marcó y alerta fuera del perímetro; **nunca bloquea** la marca (criterio DT, ver `api/lib/geofence.js`)
- **Gestión:** empleados, turnos, calendario, atrasos, horas extra, permisos, licencias médicas, justificaciones, amonestaciones, contratos con firma, consentimiento
- **Reportes:** dashboard, horas semanales, liquidaciones, exportación a Excel
- **Plataforma:** onboarding de tenants, facturación, super-admin, propuestas comerciales

## Multi-tenant

Cada empresa es un tenant identificado por `slug`. El backend resuelve el tenant en este orden (`api/lib/tenant.js`): header `x-tenant-id`, header `x-tenant-slug`, subdominio, query `?tenant=`.

## Autenticacion y autorizacion

- **Login** (`POST /api/auth/login`) entrega un token firmado (HMAC-SHA256, 12 h) con empresa, rol y correo. El frontend lo guarda en `sessionStorage` y `src/utils/adminSession.js` lo adjunta a toda llamada `/api/`.
- **Endpoints de administracion** usan `requireAuth` (`api/lib/auth.js`): el tenant sale del token, nunca de headers ni query del cliente. Se puede exigir rol: `requireAuth(req, res, { roles: ['admin'] })`. Roles: `admin`, `rrhh`, `jefe_area`, `supervisor`.
- **Endpoints publicos por diseno** (marcaje y flujos del trabajador) usan `requireTenant` (solo el slug): `attendance/register`, `attendance/pin-checkin`, `attendance/status/[id]`, `attendance/my-hours`, `auth/find-*`, `auth/create-pin`, `devices` (GET/POST), `settings/logo` (GET), `contracts`, `auth/consent`. `GET /api/employees` sin sesion solo resuelve un RUT completo y nunca devuelve el PIN.
- **Superadmin**: `POST /api/superadmin/auth` con `GLOBAL_ADMIN_SECRET` entrega un token firmado de 4 h. Tambien se acepta el header `x-admin-secret` para scripts.
- **Cron**: `check-absent` y `weekly-summary` aceptan `CRON_SECRET`, superadmin o una sesion de admin (limitada a su empresa). Define `CRON_SECRET` en Vercel.
- Las contrasenas se guardan con scrypt; las antiguas en texto plano se migran solas en el siguiente login.

## Desarrollo local

```bash
npm install
cp .env.example .env     # completar variables
npm run db:setup         # crea las tablas en Neon
npm i -g vercel
vercel dev               # API + frontend
```

`npm run dev` levanta solo el frontend (Vite, puerto 5173) y hace proxy de `/api` a `localhost:3000`.

Migraciones versionadas (`/migrations`): `node scripts/migrate.js` (simulación) y `node scripts/migrate.js --apply`. Otros scripts de base de datos: `db:migrate-multitenant`, `db:migrate-billing`. Migraciones adicionales están en `scripts/`. Para aislar por empresa los horarios y autorizadores heredados: `node scripts/migrate-tenant-scoping.js` (simulación) y luego `--apply`.

## Variables de entorno

Ver [.env.example](.env.example). Las imprescindibles: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `TIMESTAMP_SECRET` (no cambiar una vez en producción, invalida los sellos existentes), `GLOBAL_ADMIN_SECRET`.

## Tests

```bash
npm test
```

Usa el runner nativo de Node (`node --test`), sin dependencias. Cubre la lógica pura de `api/lib`: hashing de PIN, geocerca, hash de integridad y validación. Los tests van en `tests/`.

## Estructura

```
├── api/                 # Endpoints serverless (una carpeta por dominio)
│   └── lib/             # db, tenant, integrity, timestamp, geofence, hash, rateLimit, validate
├── src/                 # Frontend React
│   ├── pages/           # Una página por pantalla
│   ├── components/
│   └── api.js           # Cliente de la API
├── scripts/             # Setup y migraciones de BD, generadores de seeds
│   └── seeds/           # SQL de datos demo (sintéticos)
├── tests/               # Tests unitarios
├── docs/                # Material comercial y legal (brochure, cotizaciones, checklist Res. 38)
├── public/
└── vercel.json          # Cron de ausentes, rewrites y headers
```

## Deploy

Push a `main`: Vercel detecta Vite y despliega. Configurar las variables de entorno en Vercel y crear el Blob store con acceso público. El cron `check-absent` corre de lunes a viernes (definido en `vercel.json`).
