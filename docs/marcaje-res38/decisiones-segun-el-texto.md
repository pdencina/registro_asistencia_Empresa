# Decisiones de diseño según el texto de la Resolución Exenta N.º 38

> Fuente primaria: [Diario Oficial N.º 43.846, 9 de mayo de 2024, CVE 2489163](https://www.diariooficial.interior.gob.cl/publicaciones/2024/05/09/43846/01/2489163.pdf)
> (Res. Ex. N.º 38 de 26-04-2024, Dirección del Trabajo). Las citas son del texto publicado; los resúmenes de
> terceros (blogs de proveedores) se contradicen entre sí y **no** se usaron como fuente.
>
> Preparación técnica, no certificación. Ver `plan-de-implementacion.md`.

## Las cuatro decisiones pendientes, resueltas con el texto

### 1. Motor facial → sin exigencia técnica; se usa `local-descriptor` detrás de una interfaz

- **Art. 7 a)**: el enrolamiento e identificación puede hacerse con "cualquier hardware que permita obtener su
  reconocimiento" (biometría, teclados, cámaras, cédulas, tokens…) "en la medida que la alternativa seleccionada
  permita diferenciar a una persona de otra".
- La resolución **no fija** exactitud mínima, prueba de vida ni un motor determinado. La conformidad la evalúa el
  certificador independiente (**Art. 64–65**, análisis de vulnerabilidades incluido).
- Por eso: `local-descriptor` (face-api) es admisible como primera versión; umbral y proveedor quedan configurables.
- **Consecuencia obligatoria (Art. 7 g)**: el sistema debe contemplar *siempre* "a lo menos, dos alternativas
  diferentes de reconocimiento" y "**a lo menos una** … no deberá utilizar parámetros biométricos ni datos personales,
  por ejemplo; claves, patrones o tarjetas". El PIN **no es opcional**: es la alternativa no biométrica exigida.
  El empleador define en el contrato o reglamento interno cuál es la forma primaria y cuál la secundaria.
  → La configuración "solo facial" (empresa A del pedido) **contradice el Art. 7 g)**. El validador de políticas la
  marca como advertencia regulatoria y exige confirmación explícita y auditada para guardarla.

### 2. Enrolamiento → solo con consentimiento escrito; nada de reutilizar fotos en silencio

- **Art. 57.1**: si la plataforma requiere un dato no contemplado en el Art. 10 del Código del Trabajo (el texto da como
  ejemplo la huella digital), el trabajador debe "manifestar su conformidad **por escrito en el contrato individual o
  anexo**". El consentimiento web de hoy (`consent_status`) no equivale a ese documento: se agrega una
  referencia al documento (`consent_document_ref`) como requisito para enrolar.
- **Art. 57.2**: el documento debe indicar finalidad y modalidad de uso y prohibir la cesión a terceros (salvo el prestador).
- **Art. 57.3**: durante la relación laboral el trabajador puede pedir en cualquier momento la eliminación de sus datos.
  → Debe existir "borrar mi plantilla"; el trabajador queda con la alternativa no biométrica (PIN), coherente con el Art. 7 g).
- **Art. 57.4**: al terminar la relación se destruyen los datos personales recolectados (huellas, teléfonos, correos
  personales…) **entre 90 y 120 días** después del despido o renuncia.
- **Art. 56**: la intensidad del control debe guardar relación con su finalidad; se descarta toda vigilancia que exceda el
  registro de jornada.
- Decisión: solo se enrola a quien tiene consentimiento documentado; se captura la plantilla en el acto del
  consentimiento (o, como migración, desde la foto de perfil **solo** de quienes ya tienen consentimiento aprobado y
  tras revisión de un administrador). Quien no consintió usa PIN.

### 3. Entrada/salida → la elige el trabajador, no se infiere

- **Art. 35–36 a)**: marcación es "cualquier acto voluntario y consciente de un trabajador"; "el dependiente deberá
  saber con antelación cuándo una acción suya genere una marcación".
- **Art. 41 d)**: "No podrán automatizarse las marcaciones de inicio y fin de jornada."
- **Art. 36 c)**: si el trabajador marca "en reiteradas oportunidades seguidas un inicio o término de actividad, el
  sistema, automáticamente, mantendrá la primera de ellas y eliminará las siguientes". Esto presupone que el trabajador
  declara qué evento marca.
- Decisión: el tótem **y el móvil** piden explícitamente Entrada o Salida (hoy el móvil la infiere de la última marca).
  El servidor aplica la regla del Art. 36 c) (la primera se conserva; las repetidas no generan marcación y quedan solo
  en el registro de intentos).

### 4. Evidencia → foto solo en fallo, corta retención; las marcaciones y posiciones, 5 años

- La foto **no** figura entre los datos obligatorios del comprobante (**Art. 13**). Con el principio de proporcionalidad
  (**Art. 56**) el valor por defecto es `ON_FAILURE` (solo cuando falla la verificación facial o se usa el respaldo).
- **Marcaciones**: conservación y disponibilidad de "hasta 5 años" (**Art. 58 l)**; acceso del trabajador por un período
  mínimo de 5 años, **Art. 22.1**). **Registros de posicionamiento**: "almacenados por 5 años, al igual que las
  marcaciones" (**Art. 53 f)**). El sistema no permite configurar menos de 5 años para ellos.
- **Plantillas y datos personales**: destrucción 90–120 días tras el término de la relación (**Art. 57.4**); el sistema
  solo admite valores dentro de ese rango.
- **Fotos de evidencia**: la resolución no fija plazo. El valor inicial de 90 días es una decisión de proporcionalidad
  nuestra (coincide con el piso del Art. 57.4), **no** un requisito del texto, y es configurable.

## Lo que la lectura del texto agregó o corrigió en el plan

| # | Hallazgo (artículo) | Efecto |
|---|---|---|
| 1 | **Comprobante por correo por cada marcación** (Art. 12), imprimible, enviado desde cuenta de sistema no nominativa, con contenido mínimo (Art. 13): fecha `dd/mm/aa`, hora `hh:mm:ss`, nombre completo, RUT con puntos y guión, geolocalización (opcional), **código hash**, y datos del empleador (razón social, RUT, ubicación) | Hoy el correo es opcional y no trae hash, RUT ni datos del empleador. Etapa nueva |
| 2 | **Verificación web del comprobante por su hash** (Art. 8) | Falta. Página pública de verificación |
| 3 | **Hash con funciones nativas** del motor o lenguaje; "no se ajustarán… códigos generados de forma manual, o concatenando atributos sin aplicar estas funciones" (Art. 8) | Se usa SHA-256 nativo (`crypto` / `sha256()` de Postgres) sobre una serialización canónica de los campos. Si eso satisface la regla lo determina el certificador: **debe documentarse ante él** |
| 4 | **Correcciones (Art. 39–41)**: el empleador modifica/agrega; el sistema envía correo con original y nuevo y breve explicación; el trabajador tiene **48 h para oponerse**; sin oposición se consolida; con oposición **la marca queda en su estado original**; no antes del día hábil siguiente; solo si no perjudica al trabajador; toda alteración visible en pantalla con signo o color | Rediseña la etapa 9: la corrección es un proceso con estados `PENDIENTE → CONSOLIDADA / RECHAZADA` |
| 5 | **Cambio de clave por el trabajador** a su elección, sin más restricción que parámetros mínimos de seguridad, con **correo automático del resultado, fecha y hora** (Art. 7 f); restringirlo es infracción (Art. 58 h) | El PIN debe poder cambiarlo el propio trabajador; el "reset por administrador" solo genera un enlace de un solo uso al correo del trabajador |
| 6 | **Correo del trabajador** obligatorio, no puede repetirse entre trabajadores (Art. 12 e, 34); SMS no basta | Validación de unicidad y obligatoriedad al cargar trabajadores |
| 7 | **Offline** solo como excepción "debidamente justificada" en casos particulares; la marca se captura y se envía sola al recuperar señal (Art. 9–10). No fija antigüedad máxima ni "verificación al sincronizar" | El modo offline pasa a ser una opción de política con justificación obligatoria; el tope de horas es **decisión nuestra**, configurable |
| 8 | **Geolocalización** (Art. 53): opcional; no puede bloquear la marca; no puede exigirse durante toda la jornada; posiciones 5 años. **Certificación (Art. 65 e)**: ≥95 % de las marcaciones con error < 30 m en ≤ 3 minutos, probado al aire libre | Se guarda `geo_accuracy_m` por marca, lo que permite medir ese indicador |
| 9 | **Alertas de falta de marcación** a los 30 min del horario pactado, correo al trabajador con copia al empleador, habilitadas por defecto y desactivables (Art. 45.1) | Existe `check-absent` (solo alerta al admin, con tolerancia distinta). Ajustar |
| 10 | **Acceso del trabajador** permanente a todos sus antecedentes, ≥ 5 años, con interfaz simplificada (Art. 22.1) | `/mis-horas` accede solo con RUT; requiere autenticación |
| 11 | **Certificación** por persona jurídica independiente, con análisis de vulnerabilidades, repetida cada 24 meses (Art. 65) | Documentar arquitectura; el hash y el modelo de datos son parte del informe |
| 12 | Infraestructura: base de datos replicada y respaldada externamente, servicios en más de un servidor o datacenter, versiones con soporte (Art. 20) | Fuera del código: verificar respaldo/replicación de Neon y Vercel |
| 13 | Marcaciones en móvil: no pueden pedir más permisos que los necesarios; nunca acceso a fotos, correo ni redes (Art. 52.2 d) | Revisar permisos de la PWA |

## Reconocimientos de limitación (no resueltos por el texto)

- La resolución **no** dice cómo acreditar que el rostro proviene de una cámara en vivo. Hoy el descriptor lo calcula el
  navegador; el servidor no puede comprobarlo. Se deja registrado como `CLIENT_REPORTED` / prueba de vida informada por
  el cliente y queda como punto a plantear al certificador.
- Tampoco define la antigüedad máxima de una marca offline ni la verificación diferida: son parámetros nuestros.
- Si la marca solo con RUT es admisible **no** lo resuelve el texto de forma expresa; sí exige que el medio "permita
  diferenciar a una persona de otra" (Art. 7 a) y dos alternativas, una no biométrica (Art. 7 g). El RUT es un dato público:
  se mantiene la decisión de no usarlo como autenticación.
