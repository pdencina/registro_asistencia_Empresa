# Flexio — Ficha Técnica para Venta de Desarrollo

## Resumen Ejecutivo

Sistema electrónico de registro y control de asistencia **100% operativo en producción**, diseñado para cumplir la Resolución Exenta N°38 de la Dirección del Trabajo. Listo para certificación — solo falta el proceso formal con entidad certificadora.

**URL:** flexio.cl  
**Estado:** En producción con clientes activos  
**Desarrollador:** Flexio Technologies SpA (78.479.402-4)

---

## Stack Tecnológico

| Componente | Tecnología |
|---|---|
| Frontend | React 18 + Tailwind CSS + Vite |
| Backend | Node.js (Vercel Serverless Functions) |
| Base de datos | PostgreSQL (Neon) |
| Almacenamiento | Vercel Blob |
| Hosting | Vercel (Edge Network global) |
| Emails | Resend API |
| Pagos | MercadoPago (suscripciones) |

---

## Funcionalidades Implementadas

### Registro de Asistencia
- Marcaje por **PIN personal** (método principal)
- Marcaje por **RUT** (método secundario)
- Marcaje por **reconocimiento facial** (opcional, con IA)
- Marcaje móvil con GPS (desde celular del trabajador)
- Kiosk mode (tablet fija en entrada)
- Botones estilo BUK: Entrada / Salida → identificación → confirmación
- Comprobante por email automático al trabajador en cada marcación

### Cumplimiento Resolución 38 Exenta DT
- **Inalterabilidad:** Hash SHA-256 encadenado (registro → registro, tipo blockchain)
- **Sello de tiempo:** HMAC-SHA256 criptográfico por cada registro
- **Anti-modificación:** Triggers PostgreSQL que bloquean UPDATE y DELETE
- **Geolocalización:** Validación de geofence al momento del registro (radio configurable)
- **Acceso fiscalizador:** Endpoint con token para que la DT consulte el Libro de Asistencia
- **Libro de Asistencia:** Generación automática conforme Art. 33 Código del Trabajo
- **Modo offline:** Service Worker con IndexedDB + Background Sync
- **Verificación de integridad:** Endpoint que valida toda la cadena de hashes
- **Anchor diario:** Hash consolidado diario publicable como prueba de existencia
- **Auditoría completa:** Log de toda acción (actor, IP, timestamp, before/after)

### Gestión de Horarios y Turnos
- Horarios fijos con tolerancia configurable
- Turnos rotativos
- Jornada flexible con control de horas semanales
- Alertas automáticas cuando se excede la jornada (90% y 100%)

### Reportes
- Dashboard en tiempo real (presentes, ausentes, atrasos)
- Reporte de nómina (días trabajados, HHEE 50%/100%, ausencias, licencias)
- Ranking de puntualidad
- Tardanzas por empleado
- Ausencias justificadas vs injustificadas
- Libro de Asistencia DT exportable
- Reportes por departamento
- Exportación Excel/CSV

### Gestión de Personal
- CRUD de empleados (nombre, RUT, email, departamento, cargo, foto)
- Carga masiva por Excel
- Justificativos retroactivos (10 tipos)
- Licencias médicas
- Vacaciones y permisos
- Cartas de amonestación automáticas por acumulación de atrasos
- Salidas anticipadas con motivo y autorización

### Multi-tenant (SaaS)
- Arquitectura multi-empresa completa
- Cada empresa tiene su slug y configuración independiente
- Planes con límites (empleados, dispositivos)
- Billing integrado con MercadoPago (suscripciones automáticas)
- Propuestas comerciales online + firma digital de contrato
- Onboarding wizard (3 pasos)
- Panel de super-administrador para gestionar todos los tenants

### Seguridad
- PIN y contraseñas hasheados con scrypt (nativo Node.js)
- HTTPS en tránsito (Vercel) + cifrado en reposo (Neon)
- Rate limiting por IP
- Consentimiento biométrico digital (Ley 21.719)
- Alternativa no biométrica (PIN/RUT) para quienes no consienten
- Exportación de datos (portabilidad Ley 21.719)

### Notificaciones
- Email al trabajador en cada marcación
- Email al admin por ausencias sin justificar
- Alerta de jornada excedida al admin
- Resumen semanal (cron configurable)

### PWA (Progressive Web App)
- Instalable en celular como app nativa
- Modo offline completo
- Push notifications ready
- Manifest + íconos + splash screen

---

## Métricas del Código

- **~50 endpoints API** (serverless functions)
- **~25 páginas/vistas frontend** (React)
- **~15 componentes reutilizables**
- **6 módulos de librería** (integrity, hash, geofence, timestamp, auditLog, etc.)
- **Schema PostgreSQL** completo con 12+ tablas
- **Scripts de migración** incluidos
- **Documentación técnica** parcial

---

## Ventaja Competitiva

1. **Listo para certificar** — no requiere desarrollo adicional
2. **Producción activa** — probado con usuarios reales
3. **Costo de infraestructura bajo** — ~$20 USD/mes (Vercel + Neon free tier)
4. **Sin dependencia de hardware** — funciona con cualquier dispositivo con navegador
5. **Escalable** — serverless, sin servidores que mantener
6. **Multi-tenant desde el día 1** — vender a N empresas sin cambios

---

## ¿Qué se entrega?

- Código fuente completo (frontend + backend)
- Base de datos schema + migraciones
- Acceso a la infraestructura actual (Vercel + Neon) o deploy independiente
- Dominio flexio.cl (negociable)
- Documentación técnica existente
- Traspaso de conocimiento (2-3 sesiones)

---

## Contacto

**Pablo Encina**  
CEO & Founder — Flexio Technologies SpA  
+56 9 4961 6038  
pablo@flexio.cl  
flexio.cl
