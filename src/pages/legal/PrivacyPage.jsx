export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <a href="/" className="text-primary-600 text-sm hover:underline mb-8 inline-block">&larr; Volver al inicio</a>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: Julio 2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">1. Responsable del Tratamiento</h2>
            <p>
              El responsable del tratamiento de datos personales es la empresa-cliente que contrata 
              el servicio Marcai para gestionar la asistencia de sus colaboradores.
            </p>
            <p>
              Marcai SpA actúa como <strong>encargado del tratamiento</strong> (procesador de datos), 
              procesando los datos personales según las instrucciones del responsable y conforme a la 
              normativa vigente en Chile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">2. Datos que Recopilamos</h2>
            
            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.1 Datos del Cliente (empresa)</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Razón social, RUT empresa</li>
              <li>Nombre y email del administrador</li>
              <li>Datos de facturación</li>
            </ul>

            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.2 Datos de Colaboradores</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nombre completo y RUT</li>
              <li>Departamento y cargo</li>
              <li>Fotografía facial (dato biométrico sensible)</li>
              <li>Registros de entrada y salida con marca de tiempo</li>
              <li>Snapshots fotográficos del momento del registro</li>
            </ul>

            <h3 className="font-medium text-gray-800 mt-4 mb-2">2.3 Datos Técnicos</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Identificador de dispositivo (tótem/tablet)</li>
              <li>Datos de geolocalización del dispositivo</li>
              <li>Logs de acceso al sistema</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">3. Base Legal del Tratamiento</h2>
            <p>El tratamiento de datos se fundamenta en:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Consentimiento explícito</strong> del colaborador para datos biométricos (Art. 16 Ley 21.719)</li>
              <li><strong>Cumplimiento contractual</strong> entre la empresa-cliente y Marcai</li>
              <li><strong>Interés legítimo</strong> del empleador para control de asistencia laboral</li>
              <li><strong>Cumplimiento legal</strong> de obligaciones laborales (Código del Trabajo)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">4. Finalidad del Tratamiento</h2>
            <p>Los datos son tratados exclusivamente para:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Registro y control de asistencia laboral</li>
              <li>Verificación de identidad mediante reconocimiento facial</li>
              <li>Generación de reportes de asistencia para el empleador</li>
              <li>Detección de atrasos y ausencias</li>
              <li>Cumplimiento de obligaciones laborales del empleador</li>
            </ul>
            <p>
              <strong>No utilizamos los datos biométricos para ninguna otra finalidad</strong>, 
              ni los compartimos con terceros más allá de los servicios de infraestructura necesarios 
              para operar la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">5. Almacenamiento y Seguridad</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Los datos se almacenan en servidores seguros (Vercel / Neon Database)</li>
              <li>Encriptación en tránsito mediante TLS 1.3</li>
              <li>Encriptación en reposo AES-256</li>
              <li>Acceso restringido solo al personal técnico autorizado</li>
              <li>Backups automatizados con retención de 30 días</li>
              <li>Los descriptores faciales (vectores numéricos) se almacenan, no las imágenes originales del reconocimiento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">6. Compartición de Datos</h2>
            <p>Los datos personales <strong>NO</strong> se comparten con terceros, excepto:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Proveedores de infraestructura:</strong> Vercel (hosting), Neon (base de datos), para el funcionamiento técnico del servicio</li>
              <li><strong>Requerimiento legal:</strong> cuando sea ordenado por un tribunal o autoridad competente</li>
            </ul>
            <p>No vendemos, arrendamos ni cedemos datos personales a terceros con fines comerciales.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">7. Derechos ARCO</h2>
            <p>
              Conforme a la Ley 19.628 y Ley 21.719, los titulares de datos tienen derecho a:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Acceso:</strong> conocer qué datos personales tenemos almacenados</li>
              <li><strong>Rectificación:</strong> solicitar la corrección de datos inexactos</li>
              <li><strong>Cancelación:</strong> solicitar la eliminación de sus datos</li>
              <li><strong>Oposición:</strong> oponerse al tratamiento de sus datos</li>
              <li><strong>Portabilidad:</strong> recibir sus datos en formato estructurado</li>
            </ul>
            <p>
              Para ejercer estos derechos, el colaborador debe contactar a su empleador 
              (responsable del tratamiento), quien coordinará con Marcai la ejecución 
              de la solicitud en un plazo máximo de 15 días hábiles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">8. Retención de Datos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Los datos de asistencia se conservan durante la vigencia del contrato</li>
              <li>Tras la terminación, se otorgan 30 días para exportar datos</li>
              <li>Después de 30 días, todos los datos son eliminados permanentemente</li>
              <li>Los datos biométricos se eliminan inmediatamente si el colaborador revoca su consentimiento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">9. Consentimiento Biométrico</h2>
            <p>
              Antes de registrar datos biométricos de un colaborador, el sistema requiere 
              consentimiento explícito e informado. Este consentimiento:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Es específico para reconocimiento facial con fines de control de asistencia</li>
              <li>Es libre, informado y puede ser revocado en cualquier momento</li>
              <li>Es responsabilidad del empleador (Cliente) obtenerlo y documentarlo</li>
              <li>Se registra con fecha y hora en el sistema</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">10. Transferencia Internacional</h2>
            <p>
              Los datos pueden ser procesados en servidores ubicados fuera de Chile 
              (Estados Unidos) a través de nuestros proveedores de infraestructura (Vercel, Neon). 
              Estos proveedores cumplen con estándares de seguridad equivalentes o superiores a los 
              exigidos por la legislación chilena.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">11. Modificaciones</h2>
            <p>
              Nos reservamos el derecho de modificar esta Política de Privacidad. Los cambios 
              serán notificados al Cliente con al menos 15 días de anticipación por email. 
              El uso continuado del Servicio implica aceptación de los cambios.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">12. Contacto</h2>
            <p>
              Para consultas sobre privacidad y protección de datos:<br />
              <strong>Marcai SpA</strong><br />
              Email: privacidad@marcai.cl<br />
              Santiago, Chile
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
