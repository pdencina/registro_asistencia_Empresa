# Control de Asistencia con Registro Visual (iPad)

Sistema de control de asistencia con captura fotográfica, diseñado para funcionar como kiosco en un iPad. Deploy en Vercel con Neon Postgres + Vercel Blob.

## Stack

- **Frontend**: React 18, Vite, TailwindCSS, React Webcam, Lucide Icons
- **Backend**: Vercel Serverless Functions (Edge Runtime)
- **Base de datos**: Neon Postgres (serverless)
- **Storage de fotos**: Vercel Blob (público)
- **Optimizado para**: iPad (touch-friendly, pantalla completa, PWA)

## Funcionalidades

- Registro de entrada/salida con captura de foto desde la cámara del iPad
- Detección automática del tipo de registro (entrada o salida)
- Gestión de empleados (CRUD con foto de perfil)
- Dashboard en tiempo real con KPIs de asistencia
- Historial filtrable por fecha, tipo y departamento

## Deploy en Vercel

### 1. Crear base de datos en Neon

1. Ve a [neon.tech](https://neon.tech) y crea una cuenta gratuita
2. Crea un nuevo proyecto y base de datos
3. Copia el connection string (`DATABASE_URL`)

### 2. Crear Blob store en Vercel

1. En tu proyecto de Vercel, ve a **Storage** > **Create Database** > **Blob**
2. Selecciona acceso **Public**
3. El token `BLOB_READ_WRITE_TOKEN` se agrega automáticamente

### 3. Configurar variables de entorno en Vercel

En Settings > Environment Variables, agrega:
- `DATABASE_URL` → tu connection string de Neon

### 4. Crear las tablas

```bash
# Local con tu DATABASE_URL
DATABASE_URL=postgres://... node scripts/setup-db.js
```

### 5. Deploy

```bash
# Conectar repo a Vercel
git push origin main
# Vercel detecta Vite y despliega automáticamente
```

## Desarrollo local

```bash
npm install
npm run dev
```

Para que las API routes funcionen localmente necesitas `vercel dev`:
```bash
npm i -g vercel
vercel dev
```

## Estructura

```
├── api/                      # Vercel Serverless Functions
│   ├── lib/
│   │   ├── db.js            # Conexión Neon
│   │   └── cors.js          # CORS headers
│   ├── employees/
│   │   ├── index.js         # GET (listar) / POST (crear)
│   │   └── [id].js          # GET / PUT / DELETE por ID
│   └── attendance/
│       ├── register.js      # POST registro entrada/salida
│       ├── today.js         # GET registros de hoy
│       ├── history.js       # GET historial con filtros
│       ├── summary.js       # GET resumen/dashboard
│       └── status/[id].js   # GET estado actual del empleado
├── src/                      # Frontend React
│   ├── pages/
│   │   ├── CheckInPage.jsx  # Pantalla principal con cámara
│   │   ├── EmployeesPage.jsx
│   │   ├── AttendancePage.jsx
│   │   └── DashboardPage.jsx
│   ├── api.js               # Cliente API
│   ├── App.jsx
│   └── main.jsx
├── scripts/
│   └── setup-db.js          # Crear tablas en Neon
├── vercel.json               # Configuración Vercel
├── vite.config.js
└── package.json
```

## Uso desde iPad

1. Abre la URL de tu deploy en Safari
2. Toca "Compartir" > "Agregar a pantalla de inicio"
3. Se abre como app a pantalla completa (modo kiosco)
