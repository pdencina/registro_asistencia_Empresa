export default function DpaPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <a href="/" className="text-primary-600 text-sm hover:underline mb-8 inline-block">&larr; Volver al inicio</a>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Acuerdo de Procesamiento de Datos (DPA)</h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: Julio 2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">1. Definiciones</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Responsable del Tratamiento ("Cliente"):</strong> La empresa que contrata Marcai</li>
              <li><strong>Encargado del Tratamiento ("Marcai"):</strong> Marcai SpA</li>
              <li><strong>Titular:</strong> El colaborador cuyos datos son procesados</li>
              <li><strong>Datos Personales:</strong> Toda información relativa a personas naturales identificadas</li>
              <li><strong>Datos Biométricos:</strong> Fotografías faciales y vectores de reconocimiento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">2. Objeto del Acuerdo</h2>
            <p>
              Este DPA regula el tratamiento de datos personales que Marcai realiza en nombre
              del Cliente para la prestación del servicio de control de asistencia. Marcai
              solo procesará datos personales según las instrucciones documentadas del Cliente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">3. Obligaciones del Encargado (Marcai)</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Procesar datos únicamente para los fines establecidos en el contrato de servicio</li>
              <li>No utilizar los datos para fines propios ni compartirlos con terceros no autorizados</li>
              <li>Implementar medidas de seguridad técnicas y organizativas adecuadas</li>
              <li>Notificar al Cliente de cualquier brecha de seguridad dentro de 72 horas</li>
              <li>Asistir al Cliente en el cumplimiento de solicitudes ARCO de los titulares</li>
              <li>Eliminar todos los datos al finalizar el contrato (dentro de 30 días)</li>
              <li>Permitir auditorías razonables por parte del Cliente</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">4. Obligaciones del Responsable (Cliente)</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Obtener el consentimiento explícito e informado de cada colaborador para datos biométricos</li>
              <li>Informar a los colaboradores sobre el tratamiento de sus datos</li>
              <li>Garantizar la licitud de los datos proporcionados</li>
              <li>Responder a las solicitudes ARCO de los titulares</li>
              <li>Notificar a Marcai de cualquier cambio en las instrucciones de procesamiento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">5. Medidas de Seguridad</h2>
            <p>Marcai implementa las siguientes medidas:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Encriptación de datos en tránsito (TLS 1.3) y en reposo (AES-256)</li>
              <li>Control de acceso basado en roles</li>
              <li>Monitoreo continuo de infraestructura</li>
              <li>Backups automatizados con retención de 30 días</li>
              <li>Aislamiento lógico de datos entre clientes</li>
              <li>Registro de auditoría de accesos a datos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">6. Sub-encargados</h2>
            <p>Marcai utiliza los siguientes sub-encargados:</p>
            <table className="w-full border-collapse border border-gray-200 my-4">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-200 px-3 py-2 text-left">Proveedor</th>
                  <th className="border border-gray-200 px-3 py-2 text-left">Finalidad</th>
                  <th className="border border-gray-200 px-3 py-2 text-left">Ubicación</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">Vercel Inc.</td>
                  <td className="border border-gray-200 px-3 py-2">Hosting y ejecución</td>
                  <td className="border border-gray-200 px-3 py-2">Estados Unidos</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">Neon Inc.</td>
                  <td className="border border-gray-200 px-3 py-2">Base de datos</td>
                  <td className="border border-gray-200 px-3 py-2">Estados Unidos</td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-3 py-2">Resend Inc.</td>
                  <td className="border border-gray-200 px-3 py-2">Envío de emails</td>
                  <td className="border border-gray-200 px-3 py-2">Estados Unidos</td>
                </tr>
              </tbody>
            </table>
            <p>Cualquier cambio de sub-encargado será notificado con 15 días de anticipación.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">7. Notificación de Brechas</h2>
            <p>
              En caso de brecha de seguridad que afecte datos personales, Marcai notificará
              al Cliente dentro de 72 horas, indicando: naturaleza de la brecha, datos afectados,
              medidas adoptadas y recomendaciones.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">8. Vigencia</h2>
            <p>
              Este DPA entra en vigor con la contratación del Servicio y permanece vigente
              mientras Marcai procese datos personales del Cliente. Las obligaciones de
              confidencialidad sobreviven a la terminación del acuerdo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">9. Contacto</h2>
            <p>
              Delegado de Protección de Datos:<br />
              <strong>Marcai SpA</strong><br />
              Email: dpo@marcai.cl<br />
              Santiago, Chile
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
