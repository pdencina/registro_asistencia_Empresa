import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader, FileText } from 'lucide-react';
import SignatureCanvas from '../components/SignatureCanvas';

const PLANES = {
  basico: { nombre: 'Básico', precio: 39990, empleados: 30, dispositivos: 1 },
  profesional: { nombre: 'Profesional', precio: 79990, empleados: 100, dispositivos: 3 },
  enterprise: { nombre: 'Enterprise', precio: 149990, empleados: 300, dispositivos: 10 },
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
        if (data.contract?.estado === 'firmado') {
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
      const precio = PLANES[plan]?.precio || 39990;
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

  // Ya firmado
  if (signed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Contrato Firmado</h1>
          <p className="text-gray-600 mb-4">
            El contrato de prestación de servicios para <strong>{tenantData?.name}</strong> ha sido firmado exitosamente.
          </p>
          <p className="text-sm text-gray-400">
            Se ha registrado la firma con evidencia de auditoría (IP, timestamp, hash SHA-256).
          </p>
          {contract?.firmado_at && (
            <p className="text-xs text-gray-400 mt-4">
              Firmado el {new Date(contract.firmado_at).toLocaleString('es-CL')}
            </p>
          )}
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
                <strong>EL PRESTADOR:</strong> Pablo Encina Acevedo, quien presta los servicios objeto de este Contrato bajo la marca comercial "Flexio", en adelante "el Consultor" o "el Prestador".
              </p>
              <p>
                <strong>EL CLIENTE:</strong> {tenantData?.name || '[NOMBRE EMPRESA]'}, RUT {tenantData?.rut_empresa || '[RUT EMPRESA]'}, en adelante "el Cliente".
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
                Todos los planes incluyen: reconocimiento facial, panel de reportes online y soporte según nivel de plan. Precios en pesos chilenos (CLP), sin IVA.
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
              <p>
                Precio acordado: <strong>{modalidad === 'mensual' ? formatPrice(precioMensual) + ' mensual' : formatPrice(precioAnual) + ' anual'}</strong>.
                Forma de pago: transferencia bancaria o tarjeta.
              </p>
              <p>
                Flexio se reserva el derecho de suspender el acceso al Servicio en caso de mora superior a 15 días desde la fecha de cobro, previo aviso al Cliente.
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
                El Cliente podrá cancelar el Servicio en cualquier momento mediante aviso escrito con al menos 15 días de anticipación. En la modalidad mensual, la cancelación surte efecto al término del mes facturado.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-bold text-gray-900">11. Legislación aplicable</h3>
              <p>
                El presente Contrato se rige por las leyes de la República de Chile. Las partes fijan domicilio en Santiago y se someten a la jurisdicción de sus tribunales ordinarios.
              </p>
            </section>
          </div>
        </div>

        {/* Signing section */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-bold text-gray-900">Firma Digital del Contrato</h2>
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
                onChange={e => setFirmante({ ...firmante, rut: e.target.value })}
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
