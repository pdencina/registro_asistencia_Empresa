# Guion Demo — Luis (Certificador)

> Duración: 10 minutos
> Enfoque: Solo módulo de control de asistencia + cumplimiento Res. 38
> No mostrar: billing, propuestas, multi-tenant, landing

---

## Minuto 0-1: Contexto rápido

"Luis, te voy a mostrar el módulo funcionando en producción. 
Me enfoco en lo que evalúa la DT: registro, inalterabilidad, 
geolocalización, libro de asistencia y acceso para fiscalización."

---

## Minuto 1-3: Flujo de marcaje (lo que ve el trabajador)

**Abrir:** `flexio.cl/marcaje/demo`

Mostrar:
1. Pantalla con reloj + botones Entrada/Salida
2. Clic en **Entrada**
3. Toggle PIN / RUT — "El trabajador se identifica por PIN o RUT"
4. Ingresar un RUT de prueba → **Confirmar**
5. Pantalla verde: "Marca recibida · 08:43:53"
6. "Le llega comprobante al correo automáticamente"

**Frase clave:**
> "Sin biometría, sin hardware. Solo PIN o RUT + geolocalización del dispositivo."

---

## Minuto 3-5: Lo que ve el admin (backend)

**Abrir:** `flexio.cl/admin/demo`

Mostrar:
1. Dashboard: presentes, ausentes, atrasos del día
2. Hacer clic en un registro → mostrar los campos:
   - `record_hash`: hash SHA-256
   - `previous_hash`: encadenado al anterior
   - `timestamp_seal`: sello HMAC
   - `latitude/longitude`: geolocalización
   - `method`: pin o rut

**Frase clave:**
> "Cada registro tiene hash encadenado al anterior, tipo blockchain. 
> Si alguien modifica un dato, la cadena se rompe y se detecta."

---

## Minuto 5-6: Verificación de integridad

**En el navegador o Postman:**

```
GET /api/attendance/verify-integrity
Header: x-tenant-slug: demo
```

Mostrar respuesta:
```json
{
  "total_verified": 150,
  "integrity_ok": true,
  "message": "Todos los registros verificados — integridad OK"
}
```

**Frase clave:**
> "Este endpoint recorre toda la cadena de hashes y verifica 
> que ningún registro fue alterado. Si alguien tocó la BD, 
> aparece acá con el ID exacto del registro corrupto."

---

## Minuto 6-7: Libro de Asistencia Art. 33

**En el navegador:**

```
GET /api/attendance/libro-asistencia?start_date=2026-08-01&end_date=2026-08-24
Header: x-tenant-slug: demo
```

Mostrar:
- Empresa + RUT
- Período
- Tabla: Fecha, RUT, Nombre, Entrada, Salida, Método, Horas, Observación
- Nota legal: "Conforme al Artículo 33..."

**Frase clave:**
> "Esto es lo que pide el fiscalizador. Se genera en tiempo real, 
> no es un archivo estático que se pueda manipular."

---

## Minuto 7-8: Acceso para fiscalizador DT

**Explicar:**
"El admin genera un token desde su panel. Ese token se le entrega 
al fiscalizador de la DT. Con eso accede sin necesitar las credenciales 
de la empresa."

**Mostrar endpoint:**

```
GET /api/attendance/fiscalizacion?tenant_slug=demo&start_date=2026-08-01&end_date=2026-08-24&format=libro
Header: x-dt-token: dt_xxxxx
```

Formatos disponibles:
- `libro` — Libro de Asistencia completo con hashes
- `integrity` — Verificación de cadena
- `resumen` — Estadísticas

**Frase clave:**
> "El fiscalizador no necesita saber de tecnología. Tiene un token, 
> lo pone en el header, y obtiene el libro o la verificación."

---

## Minuto 8-9: Geofence + Modo offline

**Geofence:**
"Cuando el trabajador marca, el sistema captura su GPS y lo 
compara contra el dispositivo autorizado. Si está fuera del 
radio (configurable, default 150m), se rechaza o se alerta."

**Modo offline:**
"Si cae internet, la marca se guarda en el dispositivo 
(IndexedDB + Service Worker). Cuando vuelve la conexión, 
se sincroniza automáticamente. El timestamp es el original, 
no el de la sync."

---

## Minuto 9-10: Cierre

**Resumen técnico:**

| Requisito Res. 38 | Implementación |
|---|---|
| Inalterabilidad | Hash SHA-256 encadenado + triggers anti-DELETE |
| Sello de tiempo | HMAC-SHA256 por registro |
| Geolocalización | Haversine + geofence configurable |
| Acceso fiscalizador | Token endpoint dedicado |
| Libro Art. 33 | Generación dinámica |
| Disponibilidad | Modo offline + sync |
| Auditoría | Log completo (actor, IP, timestamp) |

**Cierre:**
> "Todo esto está en producción hoy. Lo que falta es el papel — 
> la documentación formal que tú sabes generar. El código cumple, 
> la infra cumple. ¿Qué te parece?"

---

## Tips para la call

- No hables de precio hasta que él pregunte
- Si pregunta "¿y el BIA/DRP?", responde: "Eso lo generas tú como parte de la certificación"
- Si pregunta por el código, ofrece: "Te puedo dar acceso al repo para que lo revises"
- Si dice "me interesa pero necesito verlo más", ofrece acceso temporal al repo
- Deja que él hable después del cierre — quien habla primero pierde

---

## URLs para tener abiertas antes de la call

1. `flexio.cl/marcaje/demo` (marcaje)
2. `flexio.cl/admin/demo` (dashboard admin)
3. Postman/navegador con los endpoints de API listos
