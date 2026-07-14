import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader, FileText } from 'lucide-react';
import SignatureCanvas from '../components/SignatureCanvas';

const PLANES = {
  basico: { nombre: 'Básico', precio: 59990, empleados: 30, dispositivos: 1 },
  profesional: { nombre: 'Profesional', precio: 119990, empleados: 100, dispositivos: 3 },
  enterprise: { nombre: 'Enterprise', precio: 199990, empleados: 300, dispositivos: 10 },
};

export default function ContractPage() {
  const { tenant: tenantSlug } = useParams();
  const [loading, setLoading] = useState(true);
  const [tenantData, setTenantData] = useState(null);
  const [contract, setContract] = useState(null);
  const [error, setError] = useState('');

  // Form state
  const [firmante, setFirmante] = useState({ nombre: '', rut: '', email: '' });
  const [modalidad, setModalidad] = useState('mensual');
  const [selectedPlan, setSelectedPlan] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [firmaData, setFirmaData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    loadContract();
  }, [tenantSlug]);

  async function loadContract() {
    try {
      const res = await fetch(`/api/contracts?tenant=${tenantSlug}`);
      if (res.ok) {
        const data = await res.json();
        setTenantData(data.tenant);
        setContract(data.contract);
        setSelectedPlan(data.tenant?.plan || 'basico');
        if (data.contract?.estado === 'firmado' || data.contract?.estado === 'firmado_cliente') {
          setSigned(true);
        }
      } else {
        const err = await res.json();
        setError(err.error || 'Error cargando contrato');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!firmaData) {
      setError('Debe firmar el documento antes de enviar');
      return;
    }
    if (!consentimiento) {
      setError('Debe aceptar el consentimiento');
      return;
    }
    if (!firmante.nombre || !firmante.rut) {
      setError('Nombre y RUT del firmante son obligatorios');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const plan = selectedPlan || 'basico';
      const precio = PLANES[plan]?.precio || 59990;
      const precioFinal = modalidad === 'anual' ? Math.round(precio * 12 * 0.8) : precio;

      const res = await fetch('/api/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug,
          firmante_nombre: firmante.nombre,
          firmante_rut: firmante.rut,
          firmante_email: firmante.email,
          firma_data: firmaData,
          consentimiento: true,
          plan,
          modalidad,
          precio: precioFinal,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Recargar datos del contrato para mostrar la vista firmada
        await loadContract();
        setSigned(true);
      } else {
        const err = await res.json();
        setError(err.error || 'Error al firmar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  function formatPrice(n) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
  }

  function formatRut(value) {
    let clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length === 0) return '';
    let dv = clean.slice(-1);
    let body = clean.slice(0, -1);
    if (body.length === 0) return clean;
    let formatted = '';
    let count = 0;
    for (let i = body.length - 1; i >= 0; i--) {
      formatted = body[i] + formatted;
      count++;
      if (count === 3 && i > 0) { formatted = '.' + formatted; count = 0; }
    }
    return formatted + '-' + dv;
  }

  function getTodayFormatted() {
    return new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error && !tenantData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-sm text-gray-500">Verifica que la URL sea correcta</p>
        </div>
      </div>
    );
  }

  // Ya firmado — mostrar contrato completo con firmas
  if ((signed || contract?.estado === 'firmado' || contract?.estado === 'firmado_cliente') && contract) {
    const signedPlan = PLANES[contract.plan] || PLANES.basico;
    const fechaFirma = new Date(contract.firmado_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <img src="/logo-flexio.svg" alt="Flexio" className="h-8 mx-auto mb-4" />
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium">
              <CheckCircle className="w-4 h-4" />
              Contrato firmado digitalmente — {fechaFirma}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
            <h1 className="text-xl font-bold text-gray-900 text-center mb-8">CONTRATO DE PRESTACIÓN DE SERVICIOS SaaS</h1>
            
            <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
              <section>
                <h3 className="text-base font-bold text-gray-900">1. Comparecientes</h3>
                <p>En Santiago de Chile, a {fechaFirma}, comparecen:</p>
                <p><strong>EL PRESTADOR:</strong> Pablo David Encina Acevedo, RUT 17.339.278-8, con domicilio en San Eugenio 1331, Depto 1603 B, Santiago, quien presta los servicios bajo la marca comercial "Flexio".</p>
                <p><strong>EL CLIENTE:</strong> {tenantData?.name}, RUT {tenantData?.rut_empresa || 'No registrado'}, representada por {contract.firmante_nombre}, RUT {contract.firmante_rut}.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">2. Objeto del contrato</h3>
                <p>Flexio se obliga a prestar al Cliente el servicio de control de asistencia mediante reconocimiento facial (SaaS), y el Cliente se obliga a pagar el precio correspondiente.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">3. Plan contratado</h3>
                <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
                  <p className="font-bold text-primary-900">Plan {signedPlan.nombre}</p>
                  <p className="text-sm text-primary-700">Hasta {signedPlan.empleados} colaboradores · {signedPlan.dispositivos} dispositivo{signedPlan.dispositivos > 1 ? 's' : ''}</p>
                </div>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">4. Modalidad y precio</h3>
                <p>Modalidad: <strong>{contract.modalidad === 'anual' ? 'Anual (20% descuento)' : 'Mensual'}</strong></p>
                <p>Precio acordado: <strong>{formatPrice(contract.precio)} + IVA ({formatPrice(Math.round(contract.precio * 1.19))} total) {contract.modalidad === 'anual' ? '/año' : '/mes'}</strong></p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">5. Vigencia y renovación</h3>
                <p>El Contrato entra en vigencia en la fecha de firma y se renueva automáticamente por períodos sucesivos iguales, salvo aviso con 15 días de anticipación.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">6. Período de prueba</h3>
                <p>15 días corridos sin costo desde la activación del Servicio.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">7. Protección de datos</h3>
                <p>Sujeto a Ley N° 19.628 y Ley N° 21.719. Encriptación TLS 1.3 en tránsito y AES-256 en reposo. El Cliente es responsable del consentimiento de sus colaboradores.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">8. Propiedad intelectual</h3>
                <p>El software es propiedad exclusiva del Prestador. Se otorga licencia de uso no exclusiva vigente durante el Contrato.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">9. Terminación</h3>
                <p>El Cliente puede cancelar con 15 días de aviso. En modalidad mensual, surte efecto al término del mes facturado.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">10. Obligaciones del Prestador</h3>
                <p>Disponibilidad del servicio, soporte técnico, confidencialidad, y disponibilidad mínima del 99% mensual.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">11. Obligaciones del Cliente</h3>
                <p>Pago oportuno, obtener consentimiento de colaboradores, uso conforme a normativa, designar administrador interno.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">12. Confidencialidad</h3>
                <p>Ambas partes mantienen reserva sobre información confidencial. Subsiste 2 años post-término.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">13. Limitación de responsabilidad</h3>
                <p>Responsabilidad máxima limitada a los últimos 3 meses de servicio pagados.</p>
              </section>

              <section>
                <h3 className="text-base font-bold text-gray-900">14. Legislación aplicable</h3>
                <p>Leyes de Chile. Domicilio en Santiago, tribunales ordinarios de justicia.</p>
              </section>
            </div>

            {/* Firmas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10 pt-8 border-t border-gray-200">
              <div className="text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Por el Prestador</p>
                <div className="h-20 flex items-center justify-center">
                  <img src="/firma-prestador.png" alt="Firma Pablo David Encina Acevedo" className="h-16 object-contain" />
                </div>
                <div className="border-t border-gray-300 pt-2 mt-2">
                  <p className="text-sm font-medium text-gray-900">Pablo David Encina Acevedo</p>
                  <p className="text-xs text-gray-500">RUT 17.339.278-8</p>
                  <p className="text-xs text-gray-500">Flexio</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Por el Cliente</p>
                <div className="h-20 flex items-center justify-center">
                  {contract.firma_digital ? (
                    <img src={contract.firma_digital} alt="Firma" className="h-16 object-contain" />
                  ) : (
                    <p className="text-gray-400 italic text-sm">—</p>
                  )}
                </div>
                <div className="border-t border-gray-300 pt-2 mt-2">
                  <p className="text-sm font-medium text-gray-900">{contract.firmante_nombre}</p>
                  <p className="text-xs text-gray-500">RUT {contract.firmante_rut}</p>
                  <p className="text-xs text-gray-500">{tenantData?.name}</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Documento firmado electrónicamente conforme a la Ley N° 19.799. Evidencia de auditoría registrada con hash SHA-256.
          </p>
          <div className="text-center mt-4">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              Exportar / Imprimir PDF
            </button>
          </div>
        </div>
      </div>
    );
  }

  const plan = selectedPlan || tenantData?.plan || 'basico';
  const planInfo = PLANES[plan] || PLANES.basico;
  const precioMensual = planInfo.precio;
  const precioAnual = Math.round(precioMensual * 12 * 0.8);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-8 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Contrato de Prestación de Servicios SaaS</h1>
          <p className="text-sm text-gray-500 mt-1">Sistema de control de asistencia con reconocimiento facial</p>
        </div>

        {/* Contract body */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-6">
          <div className="prose prose-sm max-w-none text-gray-700 space-y-6">

            <section>
              <h3 className="text-lg font-bold text-gray-900">1. Comparecientes</h3>
              <p>
                En Santiago de Chile, a {getTodayFormatted()}, comparecen:
              </p>
              <p>
                <strong>EL PRESTADOR:</strong> Pablo David Encina Acevedo, RUT 17.339.278-8, con domicilio en San Eugenio 1331, Depto 1603 B, Santiago, quien presta los servicios objeto de este Contrato bajo la marca comercial "Flexio", en calidad de prestador de servicios profesionales independientes (persona natural, boleta de honorarios), en adelante "el Consultor" o "el Prestador".
              </p>
              <p>
                <strong>EL CLIENTE:</strong> {tenantData?.name || '[NOMBRE EMPRESA]'}, RUT {tenantData?.rut_empresa || '[RUT EMPRESA]'}, representada por su representante legal debidamente facultado, en adelante "el Cliente".
              </p>
              <p className="text-sm text-gray-500 italic">
                Se deja constancia de que "Flexio" es la marca comercial bajo la cual el Consultor presta sus servicios, no constituyendo una persona jurídica distinta del Consultor para los efectos de este Contrato.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">2. Objeto del contrato</h3>
              <p>
                Flexio se obliga a prestar al Cliente el servicio de control de asistencia mediante reconocimiento facial (en adelante, el "Servicio"), operado como software como servicio (SaaS), conforme al plan y condiciones detalladas en la Cláusula 3, y el Cliente se obliga a pagar el precio correspondiente.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">3. Plan contratado</h3>
              <p className="text-sm text-gray-500 mb-4">Seleccione el plan que desea contratar:</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
                {Object.entries(PLANES).map(([key, info]) => (
                  <label
                    key={key}
                    className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      plan === key
                        ? 'border-primary-500 bg-primary-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="plan"
                      value={key}
                      checked={plan === key}
                      onChange={() => setSelectedPlan(key)}
                      className="sr-only"
                    />
                    <p className="font-bold text-gray-900">{info.nombre}</p>
                    <p className="text-xl font-bold text-primary-600 my-1">{formatPrice(info.precio)}<span className="text-sm font-normal text-gray-500">/mes</span></p>
                    <p className="text-xs text-gray-500">Hasta {info.empleados} colaboradores</p>
                    <p className="text-xs text-gray-500">{info.dispositivos} dispositivo{info.dispositivos > 1 ? 's' : ''}</p>
                  </label>
                ))}
              </div>
              <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 my-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-primary-900">Plan seleccionado: {planInfo.nombre}</p>
                    <p className="text-sm text-primary-700">Hasta {planInfo.empleados} colaboradores · {planInfo.dispositivos} dispositivo{planInfo.dispositivos > 1 ? 's' : ''}</p>
                  </div>
                  <p className="text-xl font-bold text-primary-600">{formatPrice(precioMensual)}/mes</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Todos los planes incluyen: reconocimiento facial, panel de reportes online y soporte según nivel de plan. Precios en pesos chilenos (CLP) + IVA.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">4. Modalidad de facturación</h3>
              <div className="flex gap-4 my-4">
                <label className={`flex-1 p-4 border-2 rounded-xl cursor-pointer transition-all ${modalidad === 'mensual' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="modalidad" value="mensual" checked={modalidad === 'mensual'} onChange={() => setModalidad('mensual')} className="sr-only" />
                  <p className="font-semibold text-gray-900">Mensual</p>
                  <p className="text-sm text-gray-500">Sin permanencia mínima</p>
                  <p className="text-lg font-bold text-primary-600 mt-2">{formatPrice(precioMensual)}/mes</p>
                </label>
                <label className={`flex-1 p-4 border-2 rounded-xl cursor-pointer transition-all ${modalidad === 'anual' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="modalidad" value="anual" checked={modalidad === 'anual'} onChange={() => setModalidad('anual')} className="sr-only" />
                  <p className="font-semibold text-gray-900">Anual <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-1">-20%</span></p>
                  <p className="text-sm text-gray-500">Pago único por 12 meses</p>
                  <p className="text-lg font-bold text-primary-600 mt-2">{formatPrice(precioAnual)}/año</p>
                </label>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">5. Precio y forma de pago</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 my-4">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-1 text-gray-600">Precio neto:</td>
                      <td className="py-1 text-right font-medium text-gray-900">{formatPrice(modalidad === 'mensual' ? precioMensual : precioAnual)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 text-gray-600">IVA (19%):</td>
                      <td className="py-1 text-right font-medium text-gray-900">{formatPrice(Math.round((modalidad === 'mensual' ? precioMensual : precioAnual) * 0.19))}</td>
                    </tr>
                    <tr className="border-t border-gray-300">
                      <td className="py-2 font-bold text-gray-900">Total a transferir:</td>
                      <td className="py-2 text-right font-bold text-primary-600 text-lg">{formatPrice(Math.round((modalidad === 'mensual' ? precioMensual : precioAnual) * 1.19))} {modalidad === 'mensual' ? '/mes' : '/año'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-gray-500">
                Forma de pago: transferencia bancaria o tarjeta. Flexio se reserva el derecho de suspender el acceso al Servicio en caso de mora superior a 15 días desde la fecha de cobro, previo aviso al Cliente.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">6. Vigencia y renovación</h3>
              <p>
                El presente Contrato entra en vigencia en la fecha de su firma digital y se renueva automáticamente por períodos sucesivos iguales a la modalidad contratada, salvo que alguna de las partes comunique su voluntad de no renovar con al menos 15 días de anticipación.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">7. Período de prueba gratuita</h3>
              <p>
                El Cliente dispone de un período de prueba de 15 días corridos desde la activación del Servicio, sin costo. Si no manifiesta su intención de continuar, el acceso se desactivará automáticamente sin generar cobro.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">8. Protección de datos personales y biométricos</h3>
              <p>
                El tratamiento de datos personales y biométricos se sujeta a la Ley N° 19.628 y a la Ley N° 21.719 sobre Protección de Datos Personales. El Cliente es responsable de recabar el consentimiento explícito de cada colaborador. Flexio trata los datos biométricos como datos sensibles, con encriptación en tránsito (TLS 1.3) y en reposo (AES-256).
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">9. Propiedad intelectual</h3>
              <p>
                El software, la plataforma, las marcas y todo elemento asociado al Servicio son de propiedad exclusiva del Consultor. Este Contrato otorga únicamente una licencia de uso no exclusiva vigente mientras dure el Contrato.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">10. Terminación</h3>
              <p>
                El Cliente podrá cancelar el Servicio en cualquier momento mediante aviso escrito con al menos 15 días de anticipación. En la modalidad mensual, la cancelación surte efecto al término del mes facturado. En la modalidad anual, no proceden devoluciones por el período ya pagado y no utilizado, salvo pacto distinto.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">11. Obligaciones del Prestador</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Poner a disposición del Cliente el Servicio conforme al plan contratado.</li>
                <li>Brindar soporte técnico según el nivel correspondiente al plan.</li>
                <li>Mantener la confidencialidad y seguridad de los datos del Cliente.</li>
                <li>Informar oportunamente sobre mantenciones programadas.</li>
                <li>Garantizar una disponibilidad mínima del 99% mensual del Servicio.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">12. Obligaciones del Cliente</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                <li>Pagar oportunamente el precio pactado.</li>
                <li>Obtener y mantener el consentimiento informado de cada colaborador cuyos datos biométricos sean tratados.</li>
                <li>Utilizar el Servicio conforme a su finalidad y a la normativa vigente.</li>
                <li>Designar un administrador interno como contraparte técnica.</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">13. Confidencialidad</h3>
              <p>
                Cada parte se obliga a mantener en reserva toda información confidencial de la otra parte a la que tenga acceso con ocasión del presente Contrato, y a no divulgarla a terceros sin autorización previa, salvo que la ley exija lo contrario. Esta obligación subsistirá por un plazo de 2 años después de terminado el Contrato.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">14. Limitación de responsabilidad</h3>
              <p>
                Flexio no será responsable por daños indirectos, lucro cesante o pérdida de datos derivados de causas ajenas a su control, incluyendo fallas de conectividad, energía o hardware del Cliente. La responsabilidad total de Flexio no excederá el monto efectivamente pagado por el Cliente durante los últimos 3 meses de servicio.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">15. Legislación aplicable y jurisdicción</h3>
              <p>
                El presente Contrato se rige por las leyes de la República de Chile. Para todos los efectos legales, las partes fijan su domicilio en la ciudad de Santiago y se someten a la jurisdicción de sus tribunales ordinarios de justicia.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">16. Validez de la firma electrónica</h3>
              <p>
                Las partes reconocen y aceptan que la firma electrónica simple utilizada en este documento tiene plena validez legal conforme a la Ley N° 19.799 sobre Documentos Electrónicos, Firma Electrónica y Servicios de Certificación. La firma se registra con evidencia de auditoría que incluye: dirección IP del firmante, timestamp en formato ISO 8601, user-agent del navegador, y hash SHA-256 tanto del documento como de la imagen de firma.
              </p>
            </section>
          </div>
        </div>

        {/* Signing section */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Firma del prestador (pre-insertada) */}
          <div className="mb-8 pb-6 border-b border-gray-200">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Firma del Prestador (Flexio)</p>
            <div className="flex items-center gap-4">
              <img src="/firma-prestador.png" alt="Firma Pablo David Encina Acevedo" className="h-14 object-contain" />
              <div>
                <p className="text-sm font-medium text-gray-900">Pablo David Encina Acevedo</p>
                <p className="text-xs text-gray-500">RUT 17.339.278-8 · Flexio</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-bold text-gray-900">Firma del Cliente</h2>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Firmante data */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo del firmante *</label>
              <input
                type="text"
                value={firmante.nombre}
                onChange={e => setFirmante({ ...firmante, nombre: e.target.value })}
                placeholder="Nombre del representante legal"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RUT del firmante *</label>
              <input
                type="text"
                value={firmante.rut}
                onChange={e => setFirmante({ ...firmante, rut: formatRut(e.target.value) })}
                placeholder="12.345.678-9"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email del firmante</label>
              <input
                type="email"
                value={firmante.email}
                onChange={e => setFirmante({ ...firmante, email: e.target.value })}
                placeholder="correo@empresa.cl"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>

          {/* Signature canvas */}
          <div className="mb-6">
            <SignatureCanvas
              onSign={(dataUrl) => setFirmaData(dataUrl)}
              existingSignature={null}
            />
            {firmaData && (
              <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Firma capturada
              </p>
            )}
          </div>

          {/* Consent */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentimiento}
                onChange={e => setConsentimiento(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-600">
                Declaro haber leído y comprendido el presente Contrato de Prestación de Servicios SaaS, y acepto que esta firma electrónica simple tiene plena validez legal conforme a la Ley N° 19.799 sobre Documentos Electrónicos y Firma Electrónica de la República de Chile.
              </span>
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !firmaData || !consentimiento || !firmante.nombre || !firmante.rut}
            className="w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {saving ? 'Firmando documento...' : 'Firmar Contrato'}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            Al firmar, se registrará su IP, timestamp y un hash SHA-256 del documento como evidencia de auditoría.
          </p>
        </form>
      </div>
    </div>
  );
}
