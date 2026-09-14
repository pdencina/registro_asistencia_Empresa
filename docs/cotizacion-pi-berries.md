# Cotización Flexio — Pi Berries SpA (Fundo Las Tres Marías)

**Cliente:** Pi Berries SpA
**Fundo:** Las Tres Marías — Mafil, Valdivia
**Contacto:** Stephanie Arancibia
**Fecha:** 14 de septiembre de 2026

---

## Contexto operacional

- **Temporada de cosecha:** ~1.200 trabajadores
  - 1.000 temporeros (cosecha)
  - 200 en packing
- **Temporada regular (fuera de cosecha):** dotación reducida
- Ubicación rural — conectividad intermitente (modo offline incluido)

---

## Modelo de precio — Por tramos de volumen

Dado el alto volumen estacional, aplicamos precio escalonado por trabajador activo/mes. Solo se cobra por trabajadores **activos** en el sistema — al terminar la temporada, los temporeros se desactivan y no se cobran.

| Tramo de trabajadores | Precio por persona/mes |
|---|---|
| 1 - 100 | $1.590 |
| 101 - 500 | $990 |
| 501 - 1.000 | $690 |
| 1.001 en adelante | $490 |

### Cálculo escalonado en peak de cosecha (1.200 trabajadores)

| Tramo | Personas | Precio unit. | Subtotal |
|---|---|---|---|
| 1 - 100 | 100 | $1.590 | $159.000 |
| 101 - 500 | 400 | $990 | $396.000 |
| 501 - 1.000 | 500 | $690 | $345.000 |
| 1.001 - 1.200 | 200 | $490 | $98.000 |
| **Total neto** | **1.200** | | **$998.000/mes** |
| IVA (19%) | | | $189.620 |
| **Total con IVA** | | | **$1.187.620/mes** |

**Precio promedio efectivo:** ~$832 por trabajador/mes (vs. $1.590 lista)

### Temporada regular (ejemplo: 150 trabajadores)

| Tramo | Personas | Precio unit. | Subtotal |
|---|---|---|---|
| 1 - 100 | 100 | $1.590 | $159.000 |
| 101 - 150 | 50 | $990 | $49.500 |
| **Total neto** | **150** | | **$208.500/mes** |
| **Total con IVA** | | | **$248.115/mes** |

---

## Qué incluye

- Marcaje por **RUT** (ideal para temporeros — no requieren PIN)
- Marcaje por PIN personal (opcional para packing/administrativos)
- **Modo offline** — funciona sin internet, sincroniza al reconectar (clave en campo)
- **Múltiples puntos de marcaje** (tótems/tablets) simultáneos
- Geolocalización de cada marca con dirección
- Registros inalterables (hash SHA-256 + sello de tiempo) — Resolución 38 DT
- Libro de Asistencia electrónico Art. 33
- Acceso para fiscalizadores DT
- Reportes: nómina, HHEE 50%/100%, atrasos, ausencias
- Carga masiva de trabajadores por Excel
- Comprobante por email en cada marca
- Dispositivos ilimitados (hasta 50 puntos de marcaje)
- Soporte prioritario

---

## Condiciones

- **Sin permanencia mínima** — se paga por temporada
- **Facturación mensual** según trabajadores activos
- **Cobro flexible:** solo por trabajadores activos en el sistema
- Prueba gratuita de 15 días
- Implementación asistida para carga inicial de temporeros

---

## Nota importante — Certificación DT

El sistema está diseñado conforme a la Resolución Exenta N°38 de la 
Dirección del Trabajo. La certificación formal está en proceso.

---

**Pablo Encina** · Flexio Technologies SpA
+56 9 4961 6038 · pablo@flexio.cl · flexio.cl
