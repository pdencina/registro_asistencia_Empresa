# Checklist: Flexio vs Resolución Exenta N°38 (DT, abril 2024)

> Análisis de brechas para certificación ante la Dirección del Trabajo.
> Normativa: Resolución Exenta N°38, 26 de abril de 2024.
> Fuente oficial: https://www.bcn.cl/leychile/navegar?idNorma=1203415

---

## Resumen Ejecutivo

| Categoría | Cumple | Parcial | No Cumple |
|-----------|--------|---------|-----------|
| Registro de marcaciones | 4 | 1 | 0 |
| Integridad y seguridad | 1 | 1 | 3 |
| Acceso del trabajador | 3 | 0 | 0 |
| Libro de Asistencia | 3 | 1 | 0 |
| Infraestructura y disponibilidad | 2 | 1 | 1 |
| Protección de datos | 2 | 1 | 1 |
| Auditoría y trazabilidad | 3 | 1 | 0 |
| Certificación y documentación | 0 | 0 | 3 |
| **TOTAL** | **18** | **6** | **8** |

---

## 1. REGISTRO DE MARCACIONES

### 1.1 Registro de hora de entrada y salida ✅ CUMPLE
- **Requisito**: El sistema debe registrar la hora exacta de inicio y término de la jornada.
- **Flexio**: `attendance_records` almacena `type` (entry/exit) con `timestamp` preciso.
- **Archivos**: `api/attendance/register.js`, `api/attendance/pin-checkin.js`

### 1.2 Método de identificación del trabajador ✅ CUMPLE
- **Requisito**: Debe existir un mecanismo que impida la suplantación de identidad.
- **Flexio**: Doble método — reconocimiento facial con foto snapshot + PIN personal como alternativa. Snapshot almacenado como evidencia.
- **Archivos**: `api/attendance/register.js` (method='visual', photo_snapshot), `api/attendance/pin-checkin.js` (method='pin')

### 1.3 Registro del método de validación utilizado ✅ CUMPLE
- **Requisito**: Debe quedar constancia del método usado para la marcación.
- **Flexio**: Campo `method` en `attendance_records` (visual, pin, mobile).
- **Archivo**: `api/attendance/libro-asistencia.js` muestra método en el libro.

### 1.4 Geolocalización de la marcación ⚠️ PARCIAL
- **Requisito**: El sistema debe registrar la ubicación geográfica donde se realiza la marcación.
- **Flexio**: Se captura GPS en `notes` (formato "GPS: lat, lng") y existe configuración de radio de geofencing (100m por defecto). Sin embargo:
  - ❌ No se almacena lat/lng en columnas dedicadas del registro de asistencia
  - ❌ No se valida que la marcación esté dentro del radio configurado (solo se registra)
  - ❌ La geolocalización no es obligatoria para completar una marcación
- **Brecha**: Agregar columnas `latitude`, `longitude` a `attendance_records`. Implementar validación de geofence al momento del registro. Hacer configurable si la geolocalización es obligatoria o no.

### 1.5 Identificación del dispositivo ✅ CUMPLE
- **Requisito**: Debe identificarse el dispositivo desde donde se realiza la marcación.
- **Flexio**: Sistema de dispositivos autorizados con `device_id`, geolocalización del dispositivo, y control de dispositivos activos por plan.
- **Archivo**: `api/devices/index.js`

---

## 2. INTEGRIDAD Y SEGURIDAD DE LOS DATOS

### 2.1 Inalterabilidad de registros ❌ NO CUMPLE
- **Requisito**: Los registros de asistencia NO deben poder ser modificados, eliminados o adulterados una vez generados.
- **Flexio**: No existe mecanismo técnico que impida la modificación. Los registros son filas normales en PostgreSQL que pueden ser UPDATEados o DELETEados.
- **Brecha CRÍTICA**: Implementar:
  - Hash criptográfico (SHA-256) por registro, incluyendo hash del registro anterior (cadena tipo blockchain)
  - Trigger en BD que impida UPDATE/DELETE en `attendance_records`
  - Si se necesita corrección, debe ser via registro nuevo de tipo "corrección" que referencia al original
  - Log de intentos de modificación

### 2.2 Firma digital o sello de tiempo ❌ NO CUMPLE
- **Requisito**: Los registros deben contar con mecanismo que garantice autenticidad e integridad (firma electrónica o sello de tiempo certificado).
- **Flexio**: No existe firma digital ni sello de tiempo certificado. Solo se almacena `timestamp` como dato.
- **Brecha CRÍTICA**: Implementar:
  - Firma electrónica avanzada o sello de tiempo de una TSA (Time Stamp Authority) reconocida
  - O bien: hash encadenado + registro periódico en un servicio de sellado de tiempo externo

### 2.3 Control de acceso al sistema ⚠️ PARCIAL
- **Requisito**: Acceso restringido con perfiles diferenciados (admin, trabajador, fiscalizador DT).
- **Flexio**: Existe autenticación por tenant con PIN de admin y login con credenciales. Pero:
  - ❌ No hay perfil "fiscalizador" para acceso de la DT
  - ❌ El PIN del admin se compara como texto plano (`pin !== tenant.admin_pin_hash`)
  - ❌ No hay roles granulares documentados
- **Brecha**: Hashear PIN con bcrypt. Crear rol de acceso para fiscalizadores DT. Documentar perfiles de acceso.

### 2.4 Cifrado de datos en tránsito y reposo ✅ CUMPLE
- **Requisito**: Comunicaciones cifradas (HTTPS) y datos sensibles protegidos.
- **Flexio**: Desplegado en Vercel (HTTPS por defecto). Base de datos Neon PostgreSQL (TLS en tránsito, cifrado en reposo).
- **Nota**: Verificar que la conexión a BD siempre use SSL.

### 2.5 Respaldo y recuperación de datos ❌ NO CUMPLE
- **Requisito**: Debe contar con mecanismos de respaldo periódico y plan de recuperación ante desastres.
- **Flexio**: Depende del proveedor de BD (Neon) para backups. No existe:
  - ❌ Política documentada de respaldos
  - ❌ Procedimiento de recuperación ante desastres (DRP)
  - ❌ Pruebas periódicas de restauración
  - ❌ Respaldo en ubicación geográfica separada
- **Brecha**: Documentar política de respaldos de Neon. Implementar backup adicional externo (ej: dump diario a S3). Crear documento de DRP.

---

## 3. ACCESO DEL TRABAJADOR A SUS REGISTROS

### 3.1 Consulta de registros propios ✅ CUMPLE
- **Requisito**: El trabajador debe poder consultar sus propias marcaciones en todo momento.
- **Flexio**: Endpoint público `GET /api/attendance/my-hours?rut=XXXXXXX` permite al trabajador ver sus horas semanales sin autenticación.
- **Archivo**: `api/attendance/my-hours.js`

### 3.2 Información en tiempo real ✅ CUMPLE
- **Requisito**: El trabajador debe conocer su estado de marcación al momento del registro.
- **Flexio**: Al marcar (facial o PIN), el sistema confirma la acción y envía email de notificación inmediata al trabajador con hora y ubicación.
- **Archivos**: `api/attendance/register.js`, `api/attendance/pin-checkin.js`

### 3.3 Historial completo ✅ CUMPLE
- **Requisito**: Acceso al historial de marcaciones del período.
- **Flexio**: `my-hours` muestra detalle diario semanal. El endpoint de historial (`api/attendance/history.js`) permite filtrar por fechas.

---

## 4. LIBRO DE ASISTENCIA ELECTRÓNICO

### 4.1 Formato compatible con fiscalización ✅ CUMPLE
- **Requisito**: Generar el Libro de Asistencia conforme al Art. 33 del Código del Trabajo.
- **Flexio**: Endpoint dedicado que genera libro con: Fecha, RUT, Nombre, Hora Entrada, Hora Salida, Método de Validación, Horas Trabajadas, Observaciones. Incluye nota legal.
- **Archivo**: `api/attendance/libro-asistencia.js`

### 4.2 Exportación para fiscalización ✅ CUMPLE
- **Requisito**: Debe poder exportarse o ponerse a disposición del fiscalizador DT.
- **Flexio**: API retorna JSON estructurado. El frontend genera CSV descargable.
- **Brecha menor**: Considerar generar PDF firmado digitalmente para presentar ante DT.

### 4.3 Conservación por 5 años ✅ CUMPLE
- **Requisito**: Los registros deben conservarse por al menos 5 años.
- **Flexio**: Base de datos sin política de eliminación automática. La nota legal menciona "Conservar por 5 años".
- **Nota**: Documentar formalmente la política de retención.

### 4.4 Disponibilidad permanente para fiscalización ⚠️ PARCIAL
- **Requisito**: La DT debe poder acceder al libro en cualquier momento.
- **Flexio**: El libro se genera bajo demanda pero requiere autenticación del tenant.
- **Brecha**: Implementar endpoint o mecanismo de acceso para fiscalizadores DT (token especial o credenciales de auditoría).

---

## 5. INFRAESTRUCTURA Y DISPONIBILIDAD

### 5.1 Disponibilidad del sistema (uptime) ✅ CUMPLE
- **Requisito**: El sistema debe estar disponible para realizar marcaciones en todo momento de la jornada laboral.
- **Flexio**: Desplegado en Vercel (99.99% uptime SLA) + Neon PostgreSQL (alta disponibilidad).
- **Nota**: Documentar SLA y estadísticas de uptime.

### 5.2 Operación ante fallas de conectividad ❌ NO CUMPLE
- **Requisito**: Debe existir mecanismo para registrar asistencia aunque haya falla de internet.
- **Flexio**: Sistema 100% cloud — si no hay internet, no se puede marcar.
- **Brecha**: Implementar modo offline en el frontend (Service Worker + IndexedDB) que registre marcaciones localmente y las sincronice cuando vuelva la conexión. Marcar registros sincronizados con flag especial.

### 5.3 Escalabilidad ✅ CUMPLE
- **Requisito**: Soportar múltiples trabajadores marcando simultáneamente.
- **Flexio**: Arquitectura serverless (Vercel) escala automáticamente.

### 5.4 Monitoreo y alertas ⚠️ PARCIAL
- **Requisito**: Monitoreo de funcionamiento del sistema.
- **Flexio**: Existe `api/health.js` para health check. Alertas de horas extra al admin.
- **Brecha**: Implementar monitoreo formal (uptime checks, alertas de error rate, dashboard de status).

---

## 6. PROTECCIÓN DE DATOS PERSONALES

### 6.1 Consentimiento para datos biométricos ✅ CUMPLE
- **Requisito**: Si usa biometría, debe obtener consentimiento informado del trabajador (Ley 21.719).
- **Flexio**: Sistema de consentimiento implementado (`consent_status` en employees). Alternativa no biométrica (PIN) para quienes no consienten.
- **Archivos**: `api/auth/consent.js`, `api/attendance/pin-checkin.js`

### 6.2 Portabilidad de datos ✅ CUMPLE
- **Requisito**: Cumplir con derecho de acceso y portabilidad (Ley 21.719).
- **Flexio**: Endpoint de exportación completa de datos del tenant en JSON.
- **Archivo**: `api/export/index.js`

### 6.3 Política de privacidad documentada ⚠️ PARCIAL
- **Requisito**: Política de tratamiento de datos personales visible y aceptada.
- **Flexio**: Existe consentimiento biométrico pero no se encontró política de privacidad formal documentada.
- **Brecha**: Crear documento de Política de Privacidad y Tratamiento de Datos conforme a Ley 21.719.

### 6.4 Eliminación de datos biométricos ❌ NO CUMPLE
- **Requisito**: Datos biométricos deben eliminarse cuando ya no son necesarios o cuando el trabajador revoca consentimiento.
- **Flexio**: Los snapshots faciales se almacenan en Vercel Blob sin política de retención/eliminación.
- **Brecha**: Implementar proceso de eliminación de snapshots cuando: (a) el trabajador revoca consentimiento, (b) transcurre el período de retención, (c) el trabajador deja la empresa.

---

## 7. AUDITORÍA Y TRAZABILIDAD

### 7.1 Log de auditoría ✅ CUMPLE
- **Requisito**: Registro de todas las acciones administrativas sobre el sistema.
- **Flexio**: Tabla `audit_log` con: tenant_id, action, actor, target_type, target_id, details (JSON before/after), IP, timestamp.
- **Archivo**: `api/lib/auditLog.js`

### 7.2 Trazabilidad de cambios ✅ CUMPLE
- **Requisito**: Poder rastrear quién hizo qué y cuándo.
- **Flexio**: El audit log registra actor, acción y detalles con before/after.

### 7.3 Auditoría accesible ✅ CUMPLE
- **Requisito**: Los registros de auditoría deben ser consultables.
- **Flexio**: API de consulta con filtros por acción y tipo de objetivo, paginación.
- **Archivo**: `api/audit/index.js`

### 7.4 Inmutabilidad del log de auditoría ⚠️ PARCIAL
- **Requisito**: El log de auditoría no debe poder ser alterado.
- **Flexio**: Es una tabla normal sin protección contra modificación.
- **Brecha**: Aplicar las mismas protecciones que los registros de asistencia (trigger anti-delete, hashing).

---

## 8. CERTIFICACIÓN Y DOCUMENTACIÓN (TODO PENDIENTE)

### 8.1 Certificación por entidad independiente ❌ NO CUMPLE
- **Requisito**: El sistema debe ser certificado por un organismo independiente autorizado.
- **Acción**: Contratar a BizPartners SpA u otro certificador autorizado.
- **Contacto**: https://bizpartners.cl/certificacion-de-aplicaciones-de-registro-y-control-de-asistencia/
- **Plazo estimado**: 6-8 semanas (certificación formal).
- **Costo**: Consultar directamente con BizPartners.

### 8.2 Documentación técnica ❌ NO CUMPLE
- **Requisito**: Manual técnico del sistema, arquitectura, flujos de datos.
- **Brecha**: Crear documento técnico formal con:
  - Arquitectura del sistema
  - Flujo de registro de marcaciones
  - Mecanismos de seguridad
  - Infraestructura y SLA
  - Modelo de datos

### 8.3 Manual de usuario ❌ NO CUMPLE
- **Requisito**: Documentación de uso para administradores y trabajadores.
- **Brecha**: Crear manual de usuario (admin + trabajador).

---

## Plan de Acción Priorizado

### Prioridad ALTA (Bloqueantes para certificación)

| # | Brecha | Esfuerzo | Impacto |
|---|--------|----------|---------|
| 1 | Inalterabilidad de registros (hash + triggers) | 2-3 días | Crítico |
| 2 | Firma digital o sello de tiempo | 3-5 días | Crítico |
| 3 | Geolocalización obligatoria con validación | 1-2 días | Alto |
| 4 | Modo offline para fallas de conectividad | 3-5 días | Alto |
| 5 | Hashear PIN admin (bcrypt) | 0.5 día | Alto |
| 6 | Acceso para fiscalizadores DT | 1-2 días | Alto |

### Prioridad MEDIA (Necesarios pero no bloqueantes solos)

| # | Brecha | Esfuerzo | Impacto |
|---|--------|----------|---------|
| 7 | Política de eliminación de datos biométricos | 1-2 días | Medio |
| 8 | Respaldo documentado + DRP | 1 día (doc) | Medio |
| 9 | Política de privacidad formal | 1 día (doc) | Medio |
| 10 | Monitoreo formal con dashboard | 1-2 días | Medio |
| 11 | Inmutabilidad del audit log | 1 día | Medio |

### Prioridad BAJA (Documentación)

| # | Brecha | Esfuerzo |
|---|--------|----------|
| 12 | Manual técnico del sistema | 2-3 días |
| 13 | Manual de usuario | 2-3 días |
| 14 | Documento de SLA y uptime | 0.5 día |

---

## Estimación Total

- **Desarrollo**: ~15-20 días de trabajo
- **Documentación**: ~5-7 días
- **Certificación (BizPartners)**: 6-8 semanas
- **Pronunciamiento DT**: Variable (semanas a meses)

## Siguiente Paso Recomendado

1. Contactar a BizPartners para una **pre-certificación** (informe de brechas) — ellos te dirán exactamente qué falta.
2. En paralelo, comenzar a implementar las brechas de Prioridad ALTA.
3. Una vez resueltas, iniciar certificación formal.
4. Con certificación aprobada, presentar solicitud a DT Departamento Jurídico.

---

*Documento generado el 2 de agosto de 2026 basado en análisis del código fuente de Flexio y la Resolución Exenta N°38 de la DT (abril 2024).*
