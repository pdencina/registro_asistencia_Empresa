export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <a href="/" className="text-primary-600 text-sm hover:underline mb-8 inline-block">&larr; Volver al inicio</a>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Términos de Servicio</h1>
        <p className="text-sm text-gray-500 mb-8">Última actualización: Julio 2026</p>

        <div className="prose prose-gray max-w-none space-y-6 text-gray-700 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">1. Aceptación de los Términos</h2>
            <p>
              Al acceder y utilizar la plataforma Marcai ("el Servicio"), usted ("el Cliente") acepta 
              quedar vinculado por estos Términos de Servicio. Si no está de acuerdo con alguna parte 
              de estos términos, no podrá acceder al Servicio.
            </p>
            <p>
              El Servicio es proporcionado por Marcai SpA, RUT XX.XXX.XXX-X, con domicilio en 
              Santiago, Chile ("Marcai", "nosotros").
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">2. Descripción del Servicio</h2>
            <p>
              Marcai es una plataforma SaaS de control de asistencia laboral mediante reconocimiento 
              facial. El Servicio incluye:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Registro de entrada y salida de colaboradores mediante reconocimiento facial</li>
              <li>Gestión de empleados, horarios y turnos</li>
              <li>Generación de reportes de asistencia</li>
              <li>Panel de administración</li>
              <li>Almacenamiento de datos biométricos de forma segura</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">3. Registro y Cuenta</h2>
            <p>
              Para utilizar el Servicio, el Cliente debe crear una cuenta proporcionando información 
              veraz y completa. El Cliente es responsable de mantener la confidencialidad de sus 
              credenciales de acceso y de todas las actividades realizadas bajo su cuenta.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">4. Planes y Pagos</h2>
            <p>
              El Servicio se ofrece mediante planes de suscripción mensual o anual. Los precios 
              están expresados en pesos chilenos (CLP) más IVA.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>El cobro se realiza de forma anticipada al inicio de cada periodo</li>
              <li>Los precios pueden ser modificados con 30 días de aviso previo</li>
              <li>No hay reembolso por cancelaciones a mitad de periodo</li>
              <li>El impago por más de 15 días puede resultar en suspensión del Servicio</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">5. Nivel de Servicio (SLA)</h2>
            <p>
              Marcai se compromete a mantener una disponibilidad del 99.5% mensual para los 
              planes Profesional y Enterprise, y del 99% para el plan Básico, medida excluyendo 
              mantenimientos programados comunicados con al menos 48 horas de anticipación.
            </p>
            <p>
              En caso de incumplimiento del SLA, el Cliente podrá solicitar un crédito proporcional 
              al tiempo de indisponibilidad, con un máximo del 30% de la mensualidad.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">6. Uso Aceptable</h2>
            <p>El Cliente se compromete a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Usar el Servicio únicamente para fines lícitos de control de asistencia laboral</li>
              <li>Obtener el consentimiento informado de cada colaborador antes de registrar datos biométricos</li>
              <li>No compartir credenciales de acceso con terceros no autorizados</li>
              <li>No intentar acceder a datos de otros clientes</li>
              <li>No realizar ingeniería inversa del Servicio</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">7. Propiedad Intelectual</h2>
            <p>
              El software, código fuente, diseño, interfaces, algoritmos y toda la documentación 
              del Servicio son propiedad exclusiva de Marcai SpA. El Cliente recibe una licencia 
              limitada, no exclusiva, no transferible y revocable para usar el Servicio durante la 
              vigencia de su suscripción.
            </p>
            <p>
              Los datos ingresados por el Cliente (información de empleados, registros de asistencia) 
              son y seguirán siendo propiedad del Cliente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">8. Limitación de Responsabilidad</h2>
            <p>
              Marcai no será responsable por daños indirectos, incidentales, especiales o 
              consecuentes, incluyendo pérdida de beneficios, datos o uso. La responsabilidad 
              total de Marcai no excederá el monto pagado por el Cliente en los últimos 
              12 meses.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">9. Terminación</h2>
            <p>
              Cualquiera de las partes puede terminar el contrato con 30 días de aviso previo. 
              Marcai puede suspender o terminar el acceso inmediatamente en caso de:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Incumplimiento de estos Términos</li>
              <li>Uso fraudulento del Servicio</li>
              <li>Impago por más de 30 días</li>
            </ul>
            <p>
              Tras la terminación, el Cliente tendrá 30 días para exportar sus datos. 
              Después de ese periodo, los datos serán eliminados de forma permanente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">10. Ley Aplicable y Jurisdicción</h2>
            <p>
              Estos Términos se rigen por las leyes de la República de Chile. Cualquier controversia 
              será sometida a los tribunales ordinarios de justicia de Santiago de Chile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-3">11. Contacto</h2>
            <p>
              Para consultas sobre estos Términos de Servicio, contactar a: <br />
              <strong>Marcai SpA</strong><br />
              Email: legal@marcai.cl<br />
              Santiago, Chile
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
