# Demos Agrícolas — Pi Berries & Catrimaitén

## Cómo cargar las demos

1. Entra a tu consola SQL de Neon (neon.tech → tu proyecto → SQL Editor)
2. Copia y pega el contenido de `seed-pi-berries.sql` → Run
3. Copia y pega el contenido de `seed-catrimaiten.sql` → Run

Cada seed crea el tenant + trabajadores + 1 semana de marcajes.

---

## Accesos para la reunión

### Pi Berries SpA (Las Tres Marías)
- **Panel admin:** flexio.cl/admin/pi-berries
- **Login:** administracion@picapital.cl / `piberries2026`
- **PIN dispositivos:** 1234
- **Marcaje (tótem):** flexio.cl/marcaje/pi-berries
- **Datos:** 60 trabajadores (50 cosecha + 10 packing), 1 semana de marcas por RUT

### Catrimaitén SpA (Loncoche)
- **Panel admin:** flexio.cl/admin/catrimaiten
- **Login:** administracion@picapital.cl / `catrimaiten2026`
- **PIN dispositivos:** 1234
- **Marcaje (tótem):** flexio.cl/marcaje/catrimaiten
- **Datos:** 60 temporeros de cosecha, 1 semana de marcas por RUT

---

## Guion de demo (10 min)

### 1. Marcaje del temporero (2 min)
- Abre `flexio.cl/marcaje/pi-berries`
- Muestra el flujo: Entrada → RUT → confirmación verde
- **Frase:** "El temporero llega, marca con su RUT en el tótem de la entrada del campo. En 2 segundos. Sin PIN, sin tarjeta, sin app que instalar."

### 2. Modo offline (1 min)
- **Frase:** "En el campo la señal es intermitente. Si cae internet, el tótem sigue funcionando — la marca se guarda local y sube cuando vuelve la conexión. No se pierde ni una marca."

### 3. Dashboard admin (3 min)
- Abre `flexio.cl/admin/pi-berries`
- Muestra: total presentes hoy, ausentes, atrasos
- Filtra por departamento (Cosecha vs Packing)
- **Frase:** "Desde Santiago ves en tiempo real quién está en el campo, sin llamar al capataz."

### 4. Reportes de nómina (2 min)
- Muestra el reporte de remuneraciones (días trabajados, HHEE)
- **Frase:** "Esto lo exporta tu contador a fin de mes. Días trabajados, horas extra al 50% y 100%, ausencias. Listo para calcular pago de temporeros."

### 5. Libro DT + fiscalización (2 min)
- Muestra el Libro de Asistencia Art. 33
- **Frase:** "Si llega la Inspección del Trabajo, esto es lo que piden. Registros inalterables con hash y sello de tiempo. Cumple Resolución 38."

---

## Argumentos clave para el cierre

- **Solo pagas por activos:** "Terminada la cosecha, desactivas los temporeros y dejas de pagar por ellos. No pagas 1.200 personas todo el año."
- **Precio por tramos:** entre más trabajadores, menor el precio unitario. En peak, el promedio baja a ~$832/persona.
- **2 empresas separadas:** cada SpA con su facturación, sus datos, su acceso. Totalmente aislado.
- **Sin hardware:** una tablet Android barata ($50.000) en la entrada de cada campo hace de tótem. Pueden poner varias para 1.000+ personas.

---

## Ojo antes de la reunión

- Corre los seeds con tiempo (5 min antes)
- Ten abiertas las 3 pestañas: marcaje, admin, y esta guía
- Los RUTs son ficticios (generados random) — si preguntan, dilo: "son datos de demostración"
