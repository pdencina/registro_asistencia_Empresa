/**
 * Contenido de los artículos del blog de Flexio.
 * Cada post tiene slug, título, meta descripción, fecha y contenido en secciones.
 * Diseñados para posicionar en Google por keywords de alto interés.
 */

export const POSTS = [
  {
    slug: 'resolucion-38-direccion-del-trabajo',
    title: '¿Qué es la Resolución 38 de la Dirección del Trabajo y cómo afecta a tu empresa?',
    description: 'Guía completa sobre la Resolución Exenta N°38 de la DT: qué exige, a quién aplica y cómo elegir un sistema de control de asistencia que cumpla la normativa.',
    date: '2026-09-14',
    readTime: '6 min',
    category: 'Normativa',
    keywords: 'resolución 38, dirección del trabajo, control asistencia certificado, ley 40 horas',
    sections: [
      { h: null, p: 'Desde mayo de 2025, todas las empresas en Chile deben contar con un sistema de registro y control de asistencia que cumpla con la Resolución Exenta N°38 de la Dirección del Trabajo (DT). Esta normativa, dictada en el marco de la Ley de 40 horas, reemplazó al antiguo Dictamen 2927/58 y establece requisitos técnicos y jurídicos mucho más estrictos.' },
      { h: '¿Qué establece la Resolución 38?', p: 'La resolución fija las condiciones que deben cumplir los sistemas electrónicos de registro y control de asistencia. En términos simples, exige que el registro de la jornada laboral sea confiable, inalterable y disponible tanto para el empleador como para el trabajador y la fiscalización.' },
      { h: 'Principales requisitos', list: [
        'Inalterabilidad: los registros no pueden ser modificados ni eliminados una vez creados.',
        'Autenticación: debe garantizarse la identidad de quien marca (evitar que uno marque por otro).',
        'Accesibilidad: trabajador y empleador acceden a la misma información.',
        'Respaldo: la información debe respaldarse periódicamente.',
        'Geolocalización: solo al momento de marcar, no de forma permanente.',
        'Libro de Asistencia electrónico conforme al Artículo 33 del Código del Trabajo.',
      ] },
      { h: '¿A quién aplica?', p: 'Aplica a todas las empresas que deben llevar control de asistencia, y a los proveedores de software que comercializan estos sistemas. El sistema debe estar autorizado por la DT mediante un Ordinario del Departamento Jurídico, previa certificación por una entidad independiente.' },
      { h: '¿Qué pasa si no cumplo?', p: 'Si la Inspección del Trabajo fiscaliza y detecta que el sistema no cumple la Resolución 38, la empresa puede ser multada. Además, en caso de un juicio laboral (por ejemplo, una desvinculación), un registro de asistencia no certificado puede no tener validez como prueba.' },
      { h: 'Cómo elegir un sistema que cumpla', p: 'Busca un sistema que garantice inalterabilidad (idealmente con hash criptográfico), sello de tiempo, geolocalización, libro de asistencia electrónico y acceso para fiscalización. Flexio está diseñado conforme a todos estos requisitos de la Resolución 38.' },
    ],
  },
  {
    slug: 'control-asistencia-agricola-temporeros',
    title: 'Control de asistencia para empresas agrícolas: cómo gestionar temporeros en cosecha',
    description: 'El control de asistencia en el agro tiene desafíos únicos: alto volumen de temporeros, faenas rurales sin señal y estacionalidad. Te explicamos cómo resolverlo.',
    date: '2026-09-14',
    readTime: '5 min',
    category: 'Agrícola',
    keywords: 'control asistencia agrícola, temporeros, cosecha, marcaje RUT, faena rural',
    sections: [
      { h: null, p: 'Las empresas agrícolas enfrentan un desafío que pocos sistemas de control de asistencia resuelven bien: gestionar cientos o miles de temporeros durante la temporada de cosecha, en campos donde la señal de internet es intermitente, y con una dotación que cambia radicalmente según la época del año.' },
      { h: 'El problema del alto volumen', p: 'Un fundo puede pasar de 50 trabajadores en temporada baja a más de 1.500 en peak de cosecha. Los sistemas tradicionales con PIN individual no sirven: nadie va a memorizar 1.500 PINs. La solución es el marcaje por RUT, donde cada temporero marca con su cédula en un tótem a la entrada del campo.' },
      { h: 'Faenas rurales sin internet', p: 'En muchos campos la conectividad es mala o inexistente. Un sistema que dependa 100% de internet deja a la empresa sin poder registrar la jornada. Por eso el modo offline es crítico: las marcaciones se guardan en el dispositivo y se sincronizan cuando vuelve la señal, sin perder ni un registro.' },
      { h: 'Pagar solo por lo que usas', p: 'Cobrar por 1.500 trabajadores todo el año cuando solo trabajan 3 meses no tiene sentido. Un buen sistema cobra solo por trabajadores activos: terminada la cosecha, se desactivan los temporeros y se deja de pagar por ellos.' },
      { h: 'Cumplimiento normativo también en el agro', p: 'La Resolución 38 de la Dirección del Trabajo aplica igual a las empresas agrícolas. El sistema debe generar el libro de asistencia y mantener registros inalterables, incluso con miles de marcaciones diarias.' },
      { h: 'La solución de Flexio', p: 'Flexio ofrece marcaje masivo por RUT, modo offline, precio escalonado por volumen (desde $1.590 bajando hasta $490 por trabajador) y cobro solo por activos. Diseñado para el ritmo del campo.' },
    ],
  },
  {
    slug: 'ley-40-horas-control-jornada',
    title: 'Ley de 40 horas: cómo afecta el control de jornada de tu empresa',
    description: 'La Ley 21.561 reduce la jornada laboral a 40 horas semanales. Te explicamos qué implica para el control de asistencia y cómo adaptarte.',
    date: '2026-09-14',
    readTime: '4 min',
    category: 'Normativa',
    keywords: 'ley 40 horas, ley 21561, jornada laboral, control de jornada, horas extra',
    sections: [
      { h: null, p: 'La Ley N°21.561, conocida como "Ley de 40 horas", reduce gradualmente la jornada laboral semanal en Chile de 45 a 40 horas. Esta reducción tiene un impacto directo en cómo las empresas deben controlar y registrar la jornada de sus trabajadores.' },
      { h: '¿Por qué importa el control de asistencia?', p: 'Con una jornada más corta, controlar con precisión las horas trabajadas es más importante que nunca. Cada minuto cuenta para calcular correctamente las remuneraciones, las horas extraordinarias y el cumplimiento del límite semanal.' },
      { h: 'La conexión con la Resolución 38', p: 'La misma Ley de 40 horas dio origen a la Resolución Exenta N°38, que obliga a las empresas a usar sistemas de registro de asistencia confiables y certificados. Es decir, la reducción de jornada vino de la mano con estándares más altos para el control horario.' },
      { h: 'Cálculo automático de horas extra', p: 'Un sistema moderno debe calcular automáticamente las horas trabajadas, detectar cuándo se superan las 40 horas semanales, y desglosar las horas extraordinarias con su recargo legal (50% en días hábiles, 100% en festivos).' },
      { h: 'Cómo te ayuda Flexio', p: 'Flexio controla la jornada en tiempo real, alerta cuando un trabajador se acerca o supera su límite semanal, y genera reportes de nómina con las horas extra ya calculadas y listas para el contador.' },
    ],
  },
];

export function getPost(slug) {
  return POSTS.find(p => p.slug === slug);
}
