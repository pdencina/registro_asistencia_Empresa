# Marcación segura — preparación técnica para la certificación (Res. Ex. N.º 38 DT)

> **Alcance y advertencia.** Este documento describe trabajo de *preparación técnica*. Ninguna
> funcionalidad aquí descrita está certificada ni se declara conforme a la Resolución 38 de la
> Dirección del Trabajo. Todo criterio regulatorio que no esté definido se deja **configurable** y
> se lista en [requisitos-configurables.md](requisitos-configurables.md) como punto abierto.

## Principios

1. **El RUT identifica; no autentica.** La identidad se verifica con un segundo elemento (facial o PIN).
2. **Nada cambia sin constancia.** Toda modificación administrativa conserva el original y queda auditada.
3. **La política no está en el código.** Métodos, umbrales, retención y geolocalización se configuran por empresa.
4. **Foto de evidencia, plantilla biométrica y resultado de la validación son tres cosas distintas.**
5. **Cambios aditivos.** No se elimina nada existente sin indicarlo; lo legado convive tras un interruptor por empresa.

## Estado por etapa

| Etapa | Contenido | Estado |
|---|---|---|
| 0 | Decisiones, matriz de requisitos configurables, corrección del checklist | ✅ hecha |
| 1 | Migraciones versionadas, columnas de evidencia v2, `timestamptz`, cadena atómica con `seq`, verificador v1+v2 | ✅ hecha (falta **aplicar** `migrations/001` en producción) |
| 2 | Hora del evento acotada, auditoría con actor real y "auditar antes de modificar", marcas importadas dentro de la cadena, coordenadas validadas, geolocalización estructurada | ✅ hecha |
| 3 | Motor de políticas por empresa (versionado, inmutable, con las reglas del texto) y pantalla de configuración | ✅ hecha (falta **aplicar** `migrations/002`) |
| 4 | PIN con hash + pepper, bloqueo progresivo, cambio por el trabajador, restablecimiento por enlace de un solo uso; migración de PINs | ✅ hecha (falta **aplicar** `migrations/002` y correr `scripts/migrate-pins.js`) |
| 5 | Plantillas biométricas cifradas, enrolamiento, verificador en servidor | ⏳ pendiente |
| 6 | Pipeline nuevo `identificar → autenticar` y reescritura del flujo del tótem/móvil | ⏳ pendiente |
| 7 | Evidencia cifrada, retención y purga | ⏳ pendiente |
| 8 | Instalaciones, dispositivos con credencial, alertas de ubicación | ⏳ pendiente |
| 9 | Correcciones con original conservado y vista efectiva; migración de los lectores | ⏳ pendiente |
| 10 | Auditoría encadenada, informe de verificación exportable, apagado del flujo legado | ⏳ pendiente |

## Lo entregado en las etapas 1–2

### Registro de asistencia v2
- Cada marca guarda: instante del evento, **hora de recepción del servidor** (`server_received_at`),
  hora del dispositivo si vino de sincronización offline (`client_timestamp`, `is_offline_sync`),
  método y resultado de autenticación (`auth_method`, `auth_result`), canal, dispositivo,
  ubicación (`latitude`, `longitude`, `geo_status`, `geo_distance_m`, `geo_accuracy_m`),
  huella de la foto de evidencia (`evidence_sha256`) y posición en la cadena (`seq`).
- El hash **v2** cubre todos esos campos con una serialización canónica y se anexa en **una sola
  sentencia SQL** que bloquea la cabeza de cadena de la empresa (`tenant_chain_heads`). Dos marcas
  simultáneas no pueden bifurcar la cadena; un índice único `(tenant_id, seq)` es la segunda guarda.
- Los registros históricos (v1) **no se tocan**: siguen verificándose con su fórmula original y el
  primer v2 se enlaza con el último v1.
- `GET /api/attendance/verify-integrity` verifica v1 y v2, detecta alteración, registros eliminados
  (saltos de `seq`) y sellos inválidos, e informa el estado de la clave de sellado.

### Etiquetado honesto del método
| Endpoint | `auth_method` | `auth_result` | Qué significa |
|---|---|---|---|
| `register` (facial del navegador) | `FACIAL` | `CLIENT_REPORTED` | El servidor **no** pudo comprobar el rostro |
| `pin-checkin` con PIN | `PIN` | `SUCCESS` | PIN validado en servidor (aún sin hash, etapa 4) |
| `pin-checkin` solo RUT | `RUT_ONLY` | `IDENTIFIED_ONLY` | Sin segundo factor; se retira en la etapa 6 |
| `bulk-marks` | `OTHER` | `ADMIN_IMPORT` | Importación administrativa (antes quedaba **fuera** de la cadena) |

Con esto se puede consultar cuántas marcas de cada empresa dependen de métodos débiles.

### Correcciones urgentes
- `_offline_timestamp` ya no se acepta sin límite: solo con `_offline_sync`, sin fecha futura y
  dentro de `OFFLINE_MAX_AGE_HOURS` (por defecto 168 h). Una marca en línea siempre usa la hora del servidor.
- `attendance/[id]` (edición/borrado) usaba `sessionStorage` dentro del servidor: la edición se
  aplicaba y luego la petición fallaba sin auditar. Ahora se **audita primero** (actor real, rol,
  IP, user-agent y el registro original completo) y, si no se puede auditar, no se cambia nada.
  Con los triggers activos responde `409 RECORD_PROTECTED`. *Es un paso interino; el modelo de
  correcciones definitivo es la etapa 9.*
- La clave del sello de tiempo registra su `key_id`; `REQUIRE_TIMESTAMP_SECRET=true` permite fallar
  cerrado si no hay `TIMESTAMP_SECRET`. No se cambió la clave en uso (invalidaría los sellos emitidos).

## Cómo poner esto en producción

1. Desplegar el código. Mientras la migración no esté aplicada, el sistema **sigue escribiendo en
   formato v1** (el código detecta el esquema), así que no hay ventana de caída.
2. `node scripts/migrate.js` (simulación) y luego `node scripts/migrate.js --apply`.
   La migración 001 es aditiva y no modifica filas; exige sesión en UTC para convertir
   `server_timestamp` y `created_at` a `timestamptz` (si no, aborta sin cambios).
3. Verificar: `GET /api/attendance/verify-integrity`.
4. Interruptor de emergencia: `FORCE_LEGACY_INTEGRITY=true` vuelve a escribir en v1.
5. **No** activar los triggers de protección (`POST /api/attendance/verify-integrity`) hasta la etapa 9:
   bloquearían la edición administrativa antes de que exista el flujo de correcciones.

## Decisiones (resueltas con el texto oficial)

Las cuatro decisiones que estaban pendientes se resolvieron leyendo la Resolución publicada en el Diario Oficial;
el detalle y los artículos están en [decisiones-segun-el-texto.md](decisiones-segun-el-texto.md).

| # | Decisión | Fundamento |
|---|---|---|
| 1 | Empresas existentes: interruptor `legacy_marking` por empresa; se apaga cuando estén enroladas | Continuidad operativa |
| 2 | Motor facial `local-descriptor` detrás de una interfaz; el PIN es **obligatorio** como alternativa no biométrica | Art. 7 a) y g) |
| 3 | Enrolamiento solo con consentimiento escrito documentado; plantilla borrable a solicitud; destrucción 90–120 días tras el término | Art. 56, 57 |
| 4 | Entrada/salida la elige el trabajador; repetidas: se conserva la primera | Art. 35-36, 41 d) |
| 5 | Foto solo en fallo; marcaciones y posiciones 5 años; fotos 90 días (parámetro propio) | Art. 13, 53 f), 56, 58 l) |
| 6 | Offline: excepción justificada; tope de antigüedad configurable (parámetro propio) | Art. 9-10 |

## Etapas 3 y 4: qué se entregó

- **Política** (`api/lib/policy.js`, `GET/PUT /api/policy`, pantalla *Política de marcación*): versiones inmutables (trigger en la base),
  validación que cita el artículo, y las restricciones del texto como `CHECK` en la base (5 años, 90–120 días, geolocalización nunca bloquea).
  "Solo facial" exige confirmación explícita porque contradice el Art. 7 g). Quitar el flujo legado exige `ENABLE_ENFORCED_MARKING=true`.
- **PIN** (`api/lib/credentials.js`): hash scrypt sobre HMAC con pepper del entorno; bloqueo progresivo (15, 30, 60… hasta 24 h) en la base de datos;
  intentos registrados sin el PIN; el trabajador cambia su PIN con correo del resultado (Art. 7 f); la administración solo envía un enlace de un solo uso.
- **Marcación con política** (`pin-checkin`): exige RUT + PIN, respuestas genéricas (sin enumeración), 423 con espera al bloquear,
  repetidas ignoradas (Art. 36 c) y `policy_version` en cada marca. `register` (facial validado por el navegador) se rechaza en este modo hasta la etapa 5.
- **Trabajadores**: con política activa la pantalla ya no genera ni muestra PIN; envía el enlace al correo del trabajador.

### Poner las etapas 3 y 4 en producción
1. Definir `PIN_PEPPER` en Vercel (no cambiarlo después).
2. `node scripts/migrate.js` y `--apply` (aplica 002).
3. `node scripts/migrate-pins.js` (simulación) y `--apply`: crea las credenciales con hash **sin** borrar el texto plano.
4. Nada cambia para las empresas mientras `legacy_marking` siga en `true` (valor por defecto).
5. `--purge-plaintext` solo cuando la empresa haya dejado el flujo legado (irreversible).

## Cambios que rompen algo (y cuándo)

- Marca solo con RUT y PIN sin RUT → etapa 6 (tras enrolar a la empresa).
- `PUT`/`DELETE` de `attendance/[id]` → etapa 9 (reemplazados por correcciones/anulaciones).
- `photo_url` en la búsqueda pública de empleados → etapa 5 (el navegador dejará de descargarla).
- Eliminar la columna `employees.personal_pin` → etapa 4, solo tras verificar la migración a hash. **Irreversible.**
