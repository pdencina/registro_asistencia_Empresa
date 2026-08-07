import { useState, useEffect, useRef } from 'react';
import PaymentInfo from '../components/PaymentInfo';

/**
 * Página de Contrato — Kiva360
 * El cliente ve los términos, datos de pago, y firma digitalmente.
 * 
 * Ruta: /contrato?ref=KV-XXXXXXXX
 */
export default function ContractPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [form, setForm] = useState({ nombre: '', rut: '', email: '', cargo: '' });
  const [consent, setConsent] = useState(false);
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');

  useEffect(() => {
    if (!ref) { setLoading(false); return; }
    fetch(`/api/contracts?proposal_ref=${encodeURIComponent(ref)}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ref]);

  // Canvas drawing handlers
  const startDraw = (e) => {
    setIsDrawing(true);
    const ctx = canvasRef.current.getContext('2d');
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };
  const draw = (e) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current.getContext('2d');
    const rect = canvasRef.current.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };
  const stopDraw = () => setIsDrawing(false);
  const clearCanvas = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleSign = async () => {
    if (!form.nombre || !form.rut || !consent) return;
    const firma_data = canvasRef.current.toDataURL('image/png');

    setSigning(true);
    try {
      const res = await fetch('/api/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal_ref: ref,
          firmante_nombre: form.nombre,
          firmante_rut: form.rut,
          firmante_email: form.email,
          firmante_cargo: form.cargo,
          firma_data,
          consentimiento: true,
        }),
      });
      const result = await res.json();
      if (result.ok) setSigned(true);
      else alert(result.error || 'Error al firmar');
    } catch { alert('Error de conexión'); }
    setSigning(false);
  };

  if (loading) return <div className="p-8 text-center">Cargando contrato...</div>;
  if (!data) return <div className="p-8 text-center text-red-600">Contrato no encontrado</div>;
  if (data.contract?.estado === 'firmado_cliente' || data.contract?.estado === 'firmado') {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-bold">Contrato ya firmado</h1>
        <p className="text-gray-600">Firmado por {data.contract.firmante_nombre} el {new Date(data.contract.firmado_at).toLocaleDateString('es-CL')}</p>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold text-green-700">Contrato firmado exitosamente</h1>
        <p className="text-gray-600">Recibirás un email de confirmación.</p>
        <PaymentInfo data={data.payment_info.prestador} />
        <p className="text-sm text-gray-500">
          Realiza tu primer pago para activar el servicio, o registra una tarjeta para cobro automático.
        </p>
      </div>
    );
  }

  const { terms, payment_info, proposal } = data;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Contrato de Prestación de Servicios</h1>
        <p className="text-gray-500">Kiva360 — Gestión Educacional Integral</p>
      </div>

      {/* Partes */}
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-lg">Partes</h2>
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Prestador</p>
            <p className="font-semibold">{payment_info.prestador.razon_social}</p>
            <p className="text-gray-600">RUT: {payment_info.prestador.rut}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Cliente</p>
            <p className="font-semibold">{proposal.company_name}</p>
            {proposal.company_rut && <p className="text-gray-600">RUT: {proposal.company_rut}</p>}
          </div>
        </div>
      </div>

      {/* Términos del servicio */}
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-lg">Condiciones del Servicio</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Plan:</span> <strong className="capitalize">{terms.plan}</strong></div>
          <div><span className="text-gray-500">Precio neto:</span> <strong>${terms.precio_neto.toLocaleString('es-CL')}/mes</strong></div>
          <div><span className="text-gray-500">IVA (19%):</span> <strong>${terms.iva.toLocaleString('es-CL')}</strong></div>
          <div><span className="text-gray-500">Total mensual:</span> <strong className="text-blue-600">${terms.total_mensual.toLocaleString('es-CL')}</strong></div>
          <div><span className="text-gray-500">Día de cobro:</span> <strong>{terms.billing_day} de cada mes</strong></div>
          <div><span className="text-gray-500">Gracia:</span> <strong>{terms.grace_days} días</strong></div>
          <div><span className="text-gray-500">Prueba gratis:</span> <strong>{terms.trial_days} días</strong></div>
          <div><span className="text-gray-500">Permanencia mínima:</span> <strong>{terms.min_contract_months === 0 ? 'Sin mínimo' : `${terms.min_contract_months} meses`}</strong></div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-700 mb-2">Incluye:</p>
          <ul className="grid grid-cols-2 gap-1 text-xs text-gray-600">
            {terms.features.map((f, i) => <li key={i}>✓ {f}</li>)}
          </ul>
        </div>
      </div>

      {/* Datos de pago */}
      <PaymentInfo data={payment_info.prestador} />

      {/* Cláusulas */}
      <div className="bg-white border rounded-xl p-6 text-xs text-gray-600 space-y-2 max-h-48 overflow-y-auto">
        <h3 className="font-semibold text-sm text-gray-900">Cláusulas</h3>
        <p><strong>1. Objeto:</strong> El Prestador provee acceso al software Kiva360 en modalidad SaaS.</p>
        <p><strong>2. Vigencia:</strong> Desde la firma. Renovación automática mensual.</p>
        <p><strong>3. Pago:</strong> El día {terms.billing_day} de cada mes. {terms.grace_days} días de gracia. Pasado ese plazo, el servicio puede suspenderse.</p>
        <p><strong>4. Terminación:</strong> Cualquier parte puede terminar con {terms.cancellation_days} días de aviso. Sin multas.</p>
        <p><strong>5. Datos:</strong> Los datos pertenecen al Cliente. El Prestador los custodia y puede exportarlos en cualquier momento.</p>
        <p><strong>6. Disponibilidad:</strong> El Prestador garantiza 99.5% de uptime mensual, excluyendo mantenciones programadas.</p>
        <p><strong>7. Confidencialidad:</strong> Ambas partes se comprometen a mantener confidencialidad sobre la información intercambiada.</p>
      </div>

      {/* Formulario de firma */}
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-lg">Firma del Representante Legal</h2>

        <div className="grid grid-cols-2 gap-4">
          <input placeholder="Nombre completo *" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})}
            className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="RUT *" value={form.rut} onChange={e => setForm({...form, rut: e.target.value})}
            className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
            className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Cargo" value={form.cargo} onChange={e => setForm({...form, cargo: e.target.value})}
            className="border rounded-lg px-3 py-2 text-sm" />
        </div>

        {/* Canvas de firma */}
        <div>
          <p className="text-sm text-gray-600 mb-2">Dibuje su firma:</p>
          <canvas ref={canvasRef} width={500} height={150}
            className="border-2 border-dashed border-gray-300 rounded-lg w-full cursor-crosshair"
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          />
          <button onClick={clearCanvas} className="text-xs text-blue-600 mt-1 hover:underline">Limpiar firma</button>
        </div>

        {/* Consentimiento */}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" />
          <span className="text-gray-700">
            Declaro que tengo facultades para representar a <strong>{proposal.company_name}</strong> y acepto
            las condiciones del servicio, la política de privacidad y autorizo el tratamiento de datos conforme a la Ley 21.719.
          </span>
        </label>

        <button onClick={handleSign} disabled={!form.nombre || !form.rut || !consent || signing}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50 hover:bg-blue-700">
          {signing ? 'Firmando...' : 'Firmar Contrato'}
        </button>
      </div>
    </div>
  );
}
