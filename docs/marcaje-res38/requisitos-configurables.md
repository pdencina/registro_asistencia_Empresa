# Requisitos de marcación: qué está implementado y qué queda configurable

> No es una declaración de cumplimiento. "Implementado" significa *funcionalidad técnica presente y
> probada*; la evaluación de conformidad corresponde a la Dirección del Trabajo. Los puntos marcados
> **ABIERTO** dependen de una definición regulatoria o legal que aún no tenemos y se dejan como parámetro.

## Matriz

| Requisito | Estado técnico | Parámetro / dónde vive | Punto regulatorio |
|---|---|---|---|
| RUT normalizado y validado (módulo 11) | Pendiente (etapa 6) | — | Definido (formato) |
| RUT identifica, no autentica | Etiquetado (`RUT_ONLY`); retiro en etapa 6 | `policy.primary_methods` | — |
| Verificación facial contra plantilla enrolada | Pendiente (etapas 5–6) | `policy.facial_threshold`, proveedor de matching | **ABIERTO**: exactitud mínima aceptable, prueba de vida, motor certificado |
| Contingencia RUT + PIN | Pendiente (etapa 4) | `policy.fallback_methods`, `policy.pin_max_attempts`, `policy.pin_lockout_minutes` | **ABIERTO**: si la DT admite PIN como método alternativo |
| PIN con hash, sin recuperación, bloqueo, reset seguro | Pendiente (etapa 4) | tabla `employee_credentials` | — |
| Método por empresa (A, B, C) | Pendiente (etapa 3) | tabla `tenant_attendance_policy` versionada | C queda "sin configurar" y no permite marcar |
| Evidencia auditable por marca | **Implementado** (v2) | columnas de `attendance_records` | — |
| Detección de alteración posterior | **Implementado** (hash encadenado + `seq` + sello) | `verify-integrity` | — |
| Sello de tiempo | **Implementado (propio, HMAC)** | `TIMESTAMP_SECRET`, `REQUIRE_TIMESTAMP_SECRET` | **ABIERTO**: si exige TSA externa (RFC 3161); el módulo está preparado para incorporarla |
| Hora consistente | **Implementado**: hora del servidor; `timestamptz` | `OFFLINE_MAX_AGE_HOURS` | **ABIERTO**: antigüedad máxima admisible en modo offline |
| Corrección sin pérdida del original | Parcial: se audita el original antes de cambiar. Modelo definitivo en etapa 9 | tabla `attendance_corrections` | — |
| Separar foto de evidencia / plantilla / resultado | Pendiente (etapas 5, 7) | `biometric_templates`, `attendance_evidence`, `auth_attempts` | **ABIERTO**: política de retención y base legal del tratamiento (ley de datos personales; asesoría legal) |
| Retención y purga | Pendiente (etapa 7) | `policy.evidence_retention_days`, `policy.template_retention_days` | **ABIERTO**: plazos |
| Geolocalización como evidencia, sin bloquear | **Implementado**: coordenadas, distancia y `geo_status` por marca | `tenant_settings.geolocation_*` | — |
| Alerta "Marcación fuera de ubicación autorizada" | Pendiente (etapa 8) | `attendance_alerts` | — |
| Aislamiento por empresa | **Implementado** (sesión firmada, tenant desde el token) | — | — |
| Control de acceso por roles | **Implementado** en la API | roles `admin/rrhh/jefe_area/supervisor` | — |
| Rate limiting persistente y bloqueo | Parcial (en memoria). Persistente en etapa 4 | — | — |
| Cifrado de información sensible | Pendiente (etapas 5, 7) | `BIOMETRIC_KEY` (con `key_id`) | — |
| HTTPS | **Implementado** (HSTS en `vercel.json`) | — | — |
| Sin biometría en API ni logs | Pendiente de verificar tras etapa 5 | — | — |

## Puntos regulatorios abiertos (a definir con la DT / asesoría)

1. Exactitud mínima, prueba de vida y motor biométrico aceptables.
2. Si el PIN es admisible como método alternativo y bajo qué condiciones.
3. Sello de tiempo: ¿basta un sello propio o se exige una autoridad externa?
4. Antigüedad máxima de una marca sincronizada tras operar sin conexión.
5. Plazos de retención de fotos de evidencia y de plantillas biométricas; base legal del tratamiento.
6. Formato de exportación para fiscalización.
7. Método de marcación exigido a cada tipo de empresa.

Cada uno se resuelve cambiando un parámetro de la política de la empresa, no el código del módulo.

## Claves de política previstas (etapa 3)

```
primary_methods        ['FACIAL']            métodos aceptados como principales
fallback_methods       ['PIN']               contingencia si el principal falla o no está disponible
channel_overrides      { TOTEM: {...}, MOBILE: {...} }
facial_threshold       0.50                  distancia máxima aceptada
pin_max_attempts       5                     intentos antes de bloquear
pin_lockout_minutes    15
evidence_photo         NEVER | ON_FAILURE | ALWAYS
evidence_retention_days / template_retention_days
geo_mode               OFF | EVIDENCE        nunca BLOCK
offline_policy         { allowed, max_age_hours, verify_on_sync }
regulatory_profile     { ... }               campo libre para lo que defina la DT
status                 ACTIVE | UNCONFIGURED
version                se incrementa en cada cambio; cada marca guarda la versión aplicada
```
