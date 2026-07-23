import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Loader, Shield, Camera, Fingerprint } from 'lucide-react';
import Webcam from 'react-webcam';

export default function ConsentPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [alreadyApproved, setAlreadyApproved] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // 'approved' | 'rejected'
  const [showSelfie, setShowSelfie] = useState(false);
  const [selfieData, setSelfieData] = useState(null);
  const webcamRef = useRef(null);

  useEffect(() => {
    loadData();
  }, [token]);

  async function loadData() {
    try {
      const res = await fetch(`/api/auth/consent?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (data.already_approved) {
          setAlreadyApproved(true);
          setEmployee(data.employee);
        } else {
          setEmployee(data.employee);
        }
      } else {
        const err = await res.json();
        setError(err.error || 'Enlace inválido');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(action) {
    if (action === 'approve' && !selfieData) {
      // Show selfie step first
      setShowSelfie(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, photo: selfieData || null }),
      });
      if (res.ok) {
        setResult(action === 'approve' ? 'approved' : 'rejected');
      } else {
        const err = await res.json();
        setError(err.error || 'Error al procesar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setSubmitting(false);
    }
  }

  function captureSelfie() {
    if (!webcamRef.current) return;
    const photo = webcamRef.current.getScreenshot();
    setSelfieData(photo);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace inválido</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (alreadyApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Ya autorizado</h1>
          <p className="text-sm text-gray-500 mb-6">
            {employee?.first_name}, tu consentimiento para el uso de reconocimiento facial en <strong>{employee?.tenant_name}</strong> ya fue registrado anteriormente.
          </p>
          <a
            href={employee?.tenant_slug ? `/app/${employee.tenant_slug}` : '/mi'}
            className="block w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all text-center"
          >
            Ir a marcar asistencia
          </a>
          <a href="/mis-horas" className="block mt-3 text-sm text-gray-400 hover:text-gray-600">
            Ver mis horas
          </a>
        </div>
      </div>
    );
  }

  if (result === 'approved') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Listo!</h1>
          <p className="text-sm text-gray-500 mb-6">
            Gracias {employee?.first_name}. Tu reconocimiento facial ha sido habilitado en <strong>{employee?.tenant_name}</strong>.
          </p>
          <p className="text-xs text-gray-400 mb-6">Ya puedes marcar tu asistencia con tu rostro.</p>
          <a
            href={employee?.tenant_slug ? `/app/${employee.tenant_slug}` : '/mi'}
            className="block w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all text-center text-lg"
          >
            Marcar asistencia ahora
          </a>
          <div className="flex gap-3 mt-3">
            <a href="/mis-horas" className="flex-1 py-2 text-sm text-gray-500 hover:text-gray-700 text-center">
              Ver mis horas
            </a>
            {employee?.tenant_slug && (
              <a href={`/simple/${employee.tenant_slug}`} className="flex-1 py-2 text-sm text-emerald-600 hover:text-emerald-700 text-center font-medium">
                Marcaje simple (PIN)
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (result === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <Fingerprint className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Consentimiento rechazado</h1>
          <p className="text-sm text-gray-500 mb-6">
            No se usará tu rostro para el registro. Podrás marcar asistencia usando tu <strong>PIN personal</strong> como método alternativo.
          </p>
          {employee?.tenant_slug && (
            <a
              href={`/pin/${employee.tenant_slug}`}
              className="block w-full py-3 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-900 transition-all text-center"
            >
              Ir a marcar con PIN
            </a>
          )}
          <p className="text-xs text-gray-400 mt-4">Si cambias de opinión, contacta a tu administrador.</p>
        </div>
      </div>
    );
  }

  // Formulario de consentimiento
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-7 mx-auto mb-4" />
          {employee?.tenant_logo && (
            <img src={employee.tenant_logo} alt="" className="h-10 mx-auto mb-3 object-contain" />
          )}
          <h1 className="text-xl font-bold text-gray-900">Autorización de Registro Biométrico</h1>
          <p className="text-sm text-gray-500 mt-1">{employee?.tenant_name}</p>
        </div>

        {/* Datos del colaborador */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden shrink-0">
              {employee?.photo_url ? (
                <img src={employee.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xl">
                  {employee?.first_name?.[0]}{employee?.last_name?.[0]}
                </div>
              )}
            </div>
            <div>
              <p className="font-bold text-gray-900">{employee?.first_name} {employee?.last_name}</p>
              <p className="text-sm text-gray-500">RUT: {employee?.rut}</p>
              {employee?.department && <p className="text-sm text-gray-400">{employee.department}{employee.position ? ` · ${employee.position}` : ''}</p>}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-amber-800 font-medium">¿Eres tú en la foto?</p>
            <p className="text-xs text-amber-700 mt-1">Verifica que la imagen corresponda a tu persona. Si no es así, contacta a tu administrador.</p>
          </div>
        </div>

        {/* Información legal */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-primary-600" />
            <h2 className="font-bold text-gray-900">Consentimiento Informado</h2>
          </div>

          <div className="space-y-3 text-sm text-gray-600">
            <p>Al autorizar, aceptas que:</p>
            <ul className="space-y-2 pl-4">
              <li className="flex items-start gap-2">
                <Camera className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                <span>Tu rostro será utilizado <strong>exclusivamente</strong> para registrar tu entrada y salida laboral.</span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                <span>Tus datos biométricos se almacenan con <strong>encriptación AES-256</strong> y se transmiten con TLS 1.3.</span>
              </li>
              <li className="flex items-start gap-2">
                <Fingerprint className="w-4 h-4 text-primary-500 mt-0.5 shrink-0" />
                <span>Puedes <strong>revocar este consentimiento</strong> en cualquier momento contactando a tu empleador.</span>
              </li>
            </ul>
            <p className="text-xs text-gray-400 mt-4">
              Conforme a la Ley N° 21.719 sobre Protección de Datos Personales y la Ley N° 19.628 sobre Protección de la Vida Privada. Si no autorizas, podrás marcar asistencia mediante PIN personal.
            </p>
          </div>
        </div>

        {/* Selfie step */}
        {showSelfie && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-4">
            <div className="text-center mb-4">
              <Camera className="w-8 h-8 text-primary-600 mx-auto mb-2" />
              <h2 className="font-bold text-gray-900">Tómate una selfie</h2>
              <p className="text-sm text-gray-500">Esta foto se usará para el reconocimiento facial</p>
            </div>

            {!selfieData ? (
              <>
                <div className="rounded-2xl overflow-hidden bg-black mb-4 aspect-square max-w-[280px] mx-auto">
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ width: 480, height: 480, facingMode: 'user' }}
                    className="w-full h-full object-cover"
                    mirrored={true}
                  />
                </div>
                <button
                  onClick={captureSelfie}
                  className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" /> Tomar foto
                </button>
              </>
            ) : (
              <>
                <div className="rounded-2xl overflow-hidden mb-4 max-w-[280px] mx-auto">
                  <img src={selfieData} alt="Tu selfie" className="w-full aspect-square object-cover" />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelfieData(null)}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-all"
                  >
                    Repetir
                  </button>
                  <button
                    onClick={() => handleAction('approve')}
                    disabled={submitting}
                    className="flex-1 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Guardando...' : 'Confirmar y autorizar'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Botones de acción */}
        {!showSelfie && (
        <div className="space-y-3">
          <button
            onClick={() => handleAction('approve')}
            disabled={submitting}
            className="w-full py-4 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 text-lg flex items-center justify-center gap-2"
          >
            {submitting ? <Loader className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
            Sí, autorizo el uso de mi rostro
          </button>

          <button
            onClick={() => handleAction('reject')}
            disabled={submitting}
            className="w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            No autorizo — usaré PIN
          </button>
        </div>
        )}

        <p className="text-xs text-gray-400 text-center mt-4">
          Se registrará tu IP y la fecha como evidencia del consentimiento.
        </p>
      </div>
    </div>
  );
}
