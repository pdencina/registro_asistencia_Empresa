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
| 3 | Motor de políticas por empresa y pantalla de configuración | ⏳ pendiente |
| 4 | PIN con hash, bloqueo por intentos, reset seguro; migración de PINs | ⏳ pendiente |
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

## Decisiones tomadas / supuestos

| # | Decisión | Estado |
|---|---|---|
| 1 | Empresas existentes: interruptor `legacy_marking` por empresa, se apaga cuando estén enroladas | Recomendado, aplica desde la etapa 3 |
| 2 | Motor facial inicial: `local-descriptor` (face-api), con proveedor intercambiable | **Por confirmar** |
| 3 | Enrolamiento: desde fotos de perfil revisadas por un admin (solo con consentimiento aprobado) o reenrolamiento | **Por confirmar** |
| 4 | Offline: verificar al sincronizar y marcar "verificada en diferido", con tope de antigüedad configurable | Recomendado |
| 5 | Entrada/salida: automática según la última marca, o elegida por el trabajador | **Por confirmar** |
| 6 | Evidencia: "solo en fallo" o "siempre" y retención inicial | **Por confirmar** |

## Cambios que rompen algo (y cuándo)

- Marca solo con RUT y PIN sin RUT → etapa 6 (tras enrolar a la empresa).
- `PUT`/`DELETE` de `attendance/[id]` → etapa 9 (reemplazados por correcciones/anulaciones).
- `photo_url` en la búsqueda pública de empleados → etapa 5 (el navegador dejará de descargarla).
- Eliminar la columna `employees.personal_pin` → etapa 4, solo tras verificar la migración a hash. **Irreversible.**
