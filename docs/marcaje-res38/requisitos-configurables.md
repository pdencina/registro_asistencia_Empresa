# Requisitos de marcación: qué está implementado y qué queda configurable

> No es una declaración de cumplimiento. "Implementado" significa *funcionalidad técnica presente y probada*; la
> evaluación de conformidad corresponde al certificador independiente y a la Dirección del Trabajo.
> Los artículos citados son de la Res. Ex. N.º 38 (texto: [decisiones-segun-el-texto.md](decisiones-segun-el-texto.md)).
> Lo que el texto **no** define se marca **PARÁMETRO NUESTRO**: es configurable y debe justificarse ante el certificador.

## Matriz

| Requisito | Artículo | Estado técnico | Parámetro / dónde vive |
|---|---|---|---|
| Dos alternativas de reconocimiento, una no biométrica | 7 g) | Validador de política (etapa 3, hecha); PIN con hash (etapa 4, hecha); facial en servidor pendiente (5) | `policy.primary_methods`, `policy.fallback_methods` |
| Forma primaria y secundaria definida por el empleador (contrato/reglamento) | 7 g) | Política por empresa versionada | `tenant_attendance_policy` |
| Clave modificable por el trabajador, con correo del resultado | 7 f), 58 h) | Hecha (etapa 4) | `POST /api/auth/change-pin` |
| Hash/checksum de cada marcación con función nativa | 8 | Implementado (SHA-256) | `api/lib/integrity.js` |
| Verificación web del comprobante por hash | 8 | Pendiente | — |
| Transmisión en línea a base central | 9 | Implementado | — |
| Offline solo como excepción justificada | 10 | Política con justificación obligatoria (etapa 3). Tope de antigüedad: **PARÁMETRO NUESTRO** | `policy.offline_policy` |
| Sello de tiempo (asignación electrónica de fecha y hora) | 11 | Implementado (`server_received_at` + sello HMAC) | — |
| Comprobante por correo por cada marcación, con contenido mínimo | 12, 13 | Parcial (correo sin hash, RUT ni datos del empleador). Pendiente | — |
| Correo del trabajador obligatorio y único | 12 e), 34 | Pendiente | — |
| Bases de datos con control de acceso y prevención de adulteración | 14 | Implementado (hash encadenado, auditoría previa al cambio). Triggers listos, sin activar hasta la etapa 9 | `createProtectionRules` |
| Perfiles de seguridad y auditoría de asignación de perfiles | 15 | Roles implementados; auditoría de asignación pendiente | — |
| Base replicada y respaldada; más de un servidor/datacenter | 20 | **Fuera del código**: verificar Neon/Vercel | — |
| Acceso del trabajador ≥ 5 años, interfaz simple | 22.1 | Parcial (`/mis-horas` solo con RUT) | — |
| Marcación voluntaria y consciente; repetidas: se conserva la primera | 35, 36 | Pendiente (etapa 6) | `policy.event_selection = WORKER_CHOICE` |
| No automatizar inicio/fin de jornada | 41 d) | Pendiente (el móvil hoy infiere el evento) | — |
| Correcciones: correo con original y nuevo, 48 h de oposición, no antes del día hábil siguiente, visibles en pantalla | 39–41 | Parcial: se audita el original antes de cambiar. Proceso completo en etapa 9 | `attendance_corrections` |
| Alertas de falta de marcación a 30 min, correo con copia al empleador, desactivables | 45.1 | Parcial (`check-absent`) | `tenant_settings.alerts_*` |
| Móvil: permisos mínimos | 52.2 d) | Por revisar | — |
| Geolocalización opcional; nunca bloquea; no permanente; posiciones 5 años | 53 | Implementado (evidencia por marca); alerta en etapa 8; retención mínima 5 años validada por la política | `policy.geo_mode` (`OFF` \| `EVIDENCE`) |
| Derechos fundamentales / proporcionalidad del control | 56 | Foto solo en fallo por defecto | `policy.evidence_photo` |
| Consentimiento **por escrito en contrato o anexo** para datos personales/biométricos | 57.1 | Parcial (`consent_status` web). Falta referencia al documento | `consent_document_ref` (etapa 5) |
| Eliminación de datos a solicitud del trabajador | 57.3 | Pendiente (etapa 5) | — |
| Destrucción 90–120 días tras el término de la relación | 57.4 | Validada en la política; tarea de purga pendiente (etapa 7) | `policy.template_destroy_after_termination_days` |
| Conservación de marcaciones hasta 5 años | 58 l) | La política no admite menos de 5 | `policy.marks_retention_years` |
| Certificación independiente, cada 24 meses | 64–65 | Proceso externo | — |

## Parámetros de política (implementados en la etapa 3)

```
status                 ACTIVE | UNCONFIGURED     UNCONFIGURED no permite marcar por el flujo nuevo
legacy_marking         true                      flujo actual (RUT solo permitido) mientras la empresa se enrola
primary_methods        ['FACIAL']                FACIAL | PIN
fallback_methods       ['PIN']                   Art. 7 g): la unión debe tener ≥ 2 métodos y al menos uno no biométrico
channel_overrides      { TOTEM: {...}, MOBILE: {...} }
event_selection        WORKER_CHOICE             Art. 35-36 y 41 d)
facial_threshold       0.50                      distancia euclídea máxima aceptada
pin_min_length         4
pin_max_attempts       5                         intentos antes de bloquear
pin_lockout_minutes    15
evidence_photo         NEVER | ON_FAILURE | ALWAYS      por defecto ON_FAILURE (Art. 56)
evidence_retention_days                90          PARÁMETRO NUESTRO (el texto no fija plazo para fotos)
template_destroy_after_termination_days   90     Art. 57.4: debe estar entre 90 y 120
marks_retention_years  5                         Art. 53 f) y 58 l): no puede ser menor
geo_mode               OFF | EVIDENCE            BLOCK no existe (Art. 53 c)
offline_policy         { allowed, max_age_hours: 168, justification }   Art. 10: justificación obligatoria
regulatory_profile     { }                       campo libre para lo que defina la DT o el certificador
```

Cada cambio crea una **versión nueva** (las anteriores no se modifican) y cada marca guarda `policy_version`.

## Puntos que el texto no resuelve (a plantear al certificador)

1. Cómo acreditar que el rostro proviene de una cámara en vivo (prueba de vida) y la exactitud mínima aceptable.
2. Si el RUT ingresado en el tótem, sin segundo factor, es admisible como identificación. El Art. 7 a) exige que el
   medio "permita diferenciar a una persona de otra"; se mantiene la decisión de no usarlo como autenticación.
3. Antigüedad máxima de una marca offline y si debe verificarse la identidad al sincronizar.
4. Plazo de conservación de las fotos de evidencia.
5. Formato de exportación para el portal de fiscalización (Art. 17, 22.4, 25–27).
