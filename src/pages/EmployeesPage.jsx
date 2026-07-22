import { useState, useEffect, useRef } from 'react';
import { UserPlus, Edit2, Trash2, Camera, X, Search, Power, PowerOff, Shield, KeyRound } from 'lucide-react';
import Webcam from 'react-webcam';
import { employeesApi } from '../api';

// Tipos de documento soportados
const DOC_TYPES = [
  { value: 'RUT', label: 'RUT (Chile)', placeholder: '12.345.678-9' },
  { value: 'CI_VE', label: 'Cédula (Venezuela)', placeholder: 'V-12.345.678' },
  { value: 'CC_CO', label: 'Cédula (Colombia)', placeholder: '1.234.567.890' },
  { value: 'DNI', label: 'DNI (Perú/Argentina)', placeholder: '12345678' },
  { value: 'PASSPORT', label: 'Pasaporte', placeholder: 'AB1234567' },
  { value: 'OTHER', label: 'Otro documento', placeholder: 'Número de documento' },
];

// Formatea según tipo de documento
function formatDocument(value, type) {
  switch (type) {
    case 'RUT':
      return formatRut(value);
    case 'CI_VE':
      return formatVenezuela(value);
    case 'CC_CO':
      return formatColombia(value);
    default:
      return value;
  }
}

// Valida según tipo de documento
function validateDocument(value, type) {
  if (!value || value.trim().length < 3) return { valid: false, error: 'Documento muy corto' };

  switch (type) {
    case 'RUT':
      return validateRut(value) ? { valid: true } : { valid: false, error: 'RUT inválido. Verifica el dígito verificador.' };
    case 'CI_VE':
      return validateVenezuela(value) ? { valid: true } : { valid: false, error: 'Cédula venezolana inválida. Formato: V-12.345.678' };
    case 'CC_CO':
      return validateColombia(value) ? { valid: true } : { valid: false, error: 'Cédula colombiana inválida. Debe tener 6-10 dígitos.' };
    case 'DNI':
      return validateDNI(value) ? { valid: true } : { valid: false, error: 'DNI inválido. Debe tener 7-8 dígitos.' };
    case 'PASSPORT':
      return value.trim().length >= 5 ? { valid: true } : { valid: false, error: 'Pasaporte inválido. Mínimo 5 caracteres.' };
    case 'OTHER':
      return { valid: true };
    default:
      return { valid: true };
  }
}

// === RUT Chile ===
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

function validateRut(rut) {
  const clean = rut.replace(/[.\-]/g, '').toUpperCase();
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  let sum = 0, multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  let expectedDv;
  if (remainder === 11) expectedDv = '0';
  else if (remainder === 10) expectedDv = 'K';
  else expectedDv = String(remainder);
  return dv === expectedDv;
}

// === Cédula Venezuela ===
function formatVenezuela(value) {
  let clean = value.replace(/[^0-9vVeEjJgG]/g, '').toUpperCase();
  if (clean.length === 0) return '';
  // First char should be V, E, J or G
  let prefix = '';
  if (/^[VEJG]/.test(clean)) {
    prefix = clean[0] + '-';
    clean = clean.slice(1);
  }
  // Format numbers with dots
  let formatted = '';
  let count = 0;
  for (let i = clean.length - 1; i >= 0; i--) {
    if (!/\d/.test(clean[i])) continue;
    formatted = clean[i] + formatted;
    count++;
    if (count === 3 && i > 0) { formatted = '.' + formatted; count = 0; }
  }
  return prefix + formatted;
}

function validateVenezuela(value) {
  const clean = value.replace(/[.\-\s]/g, '').toUpperCase();
  // V/E/J/G followed by 6-9 digits
  return /^[VEJG]?\d{6,9}$/.test(clean);
}

// === Cédula Colombia ===
function formatColombia(value) {
  let clean = value.replace(/\D/g, '');
  if (clean.length === 0) return '';
  let formatted = '';
  let count = 0;
  for (let i = clean.length - 1; i >= 0; i--) {
    formatted = clean[i] + formatted;
    count++;
    if (count === 3 && i > 0) { formatted = '.' + formatted; count = 0; }
  }
  return formatted;
}

function validateColombia(value) {
  const clean = value.replace(/\D/g, '');
  return clean.length >= 6 && clean.length <= 10;
}

// === DNI (Perú/Argentina) ===
function validateDNI(value) {
  const clean = value.replace(/\D/g, '');
  return clean.length >= 7 && clean.length <= 8;
}

// Capitaliza la primera letra de cada palabra
function capitalize(value) {
  return value.replace(/(^|\s)\S/g, (char) => char.toUpperCase());
}

// Formatea teléfono chileno: +56 9 1234 5678
function formatPhone(value) {
  let clean = value.replace(/[^\d+]/g, '');
  
  // Si empieza con +, mantener
  if (clean.startsWith('+')) {
    const digits = clean.slice(1).replace(/\D/g, '');
    if (digits.startsWith('56')) {
      // Chilean format
      const rest = digits.slice(2);
      if (rest.length <= 1) return `+56 ${rest}`;
      if (rest.length <= 5) return `+56 ${rest.slice(0,1)} ${rest.slice(1)}`;
      return `+56 ${rest.slice(0,1)} ${rest.slice(1,5)} ${rest.slice(5,9)}`;
    }
    // Other international
    return '+' + digits;
  }
  
  // Sin +, asumir chileno
  clean = clean.replace(/\D/g, '');
  if (clean.startsWith('569')) {
    const rest = clean.slice(3);
    return `+56 9 ${rest.slice(0,4)} ${rest.slice(4,8)}`.trim();
  }
  if (clean.startsWith('56')) {
    const rest = clean.slice(2);
    if (rest.length <= 1) return `+56 ${rest}`;
    return `+56 ${rest.slice(0,1)} ${rest.slice(1,5)} ${rest.slice(5,9)}`.trim();
  }
  if (clean.startsWith('9') && clean.length <= 9) {
    return `+56 9 ${clean.slice(1,5)} ${clean.slice(5,9)}`.trim();
  }
  return clean;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [search, setSearch] = useState('');
  const [showPhotoCapture, setShowPhotoCapture] = useState(null);
  const [newEmployeePhoto, setNewEmployeePhoto] = useState(null); // For post-creation photo
  const [confirmAction, setConfirmAction] = useState(null); // { employee, action: 'deactivate'|'activate' }
  const [error, setError] = useState('');
  const [rutError, setRutError] = useState('');
  const [formData, setFormData] = useState({ rut: '', doc_type: 'RUT', first_name: '', last_name: '', department: '', position: '', email: '', phone: '' });
  const [showConsent, setShowConsent] = useState(null); // employee object to consent for
  const [consentAccepted, setConsentAccepted] = useState(false);
  const webcamRef = useRef(null);
  const webcamNewRef = useRef(null);

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees() {
    try {
      const data = await employeesApi.getAll();
      setEmployees(data);
    } catch (err) { console.error(err); }
  }

  function openForm(employee = null) {
    if (employee) {
      setEditingEmployee(employee);
      setFormData({
        rut: employee.rut,
        doc_type: employee.doc_type || 'RUT',
        first_name: employee.first_name,
        last_name: employee.last_name,
        department: employee.department || '',
        position: employee.position || '',
        email: employee.email || '',
        phone: employee.phone || '',
      });
    } else {
      setEditingEmployee(null);
      setFormData({ rut: '', doc_type: 'RUT', first_name: '', last_name: '', department: '', position: '', email: '', phone: '' });
    }
    setShowForm(true);
    setError('');
    setRutError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setRutError('');

    const validation = validateDocument(formData.rut, formData.doc_type);
    if (!validation.valid) {
      setRutError(validation.error);
      return;
    }

    try {
      if (editingEmployee) {
        await employeesApi.update(editingEmployee.id, formData);
        setShowForm(false);
        loadEmployees();
      } else {
        // Create employee, then ask for consent + photo
        const newEmployee = await employeesApi.create(formData);
        setShowForm(false);
        setShowConsent(newEmployee);
        setConsentAccepted(false);
        loadEmployees();
      }
    } catch (err) { setError(err.message); }
  }

  async function handleToggleActive() {
    if (!confirmAction) return;
    const { employee, action } = confirmAction;
    try {
      if (action === 'deactivate') {
        await employeesApi.delete(employee.id);
      } else if (action === 'activate') {
        await employeesApi.update(employee.id, { active: true });
      } else if (action === 'delete') {
        await employeesApi.permanentDelete(employee.id);
      }
      setConfirmAction(null);
      loadEmployees();
    } catch (err) { console.error(err); }
  }

  async function capturePhoto(employeeId) {
    if (!webcamRef.current) return;
    const photo = webcamRef.current.getScreenshot();
    try {
      await employeesApi.update(employeeId, { photo });
      setShowPhotoCapture(null);
      loadEmployees();
    } catch (err) { console.error(err); }
  }

  async function captureNewEmployeePhoto() {
    if (!webcamNewRef.current || !newEmployeePhoto) return;
    const photo = webcamNewRef.current.getScreenshot();
    if (!photo) return;
    try {
      await employeesApi.update(newEmployeePhoto.id, { photo });
      setNewEmployeePhoto(null);
      loadEmployees();
    } catch (err) { console.error(err); }
  }

  async function handleConsentAccepted() {
    if (!showConsent) return;
    // Save consent timestamp on the employee
    try {
      await employeesApi.update(showConsent.id, { consent_at: new Date().toISOString() });
    } catch (e) {
      // Non-critical, continue to photo
    }
    const employee = showConsent;
    setShowConsent(null);
    setConsentAccepted(false);
    // Proceed to photo capture
    setNewEmployeePhoto(employee);
  }

  const [pinAssigned, setPinAssigned] = useState(null); // { pin, name, url }

  async function handleConsentDeclined() {
    if (!showConsent) return;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const tenantSlug = sessionStorage.getItem('admin_tenant') || '';
    try {
      await employeesApi.update(showConsent.id, { personal_pin: pin });

      // Enviar PIN por email al colaborador si tiene email
      if (showConsent.email) {
        fetch('/api/notifications/send-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-slug': tenantSlug,
          },
          body: JSON.stringify({
            employee_id: showConsent.id,
            pin,
            slug: tenantSlug,
          }),
        }).catch(() => {});
      }

      setPinAssigned({
        pin,
        name: `${showConsent.first_name} ${showConsent.last_name}`,
        url: `flexio.cl/pin/${tenantSlug}`,
        hasEmail: !!showConsent.email,
      });
    } catch (e) {
      setError('Error al asignar PIN. Intenta nuevamente.');
    }
    setShowConsent(null);
    setConsentAccepted(false);
    loadEmployees();
  }

  const filteredEmployees = employees.filter(e => {
    const term = search.toLowerCase();
    return e.first_name.toLowerCase().includes(term) ||
           e.last_name.toLowerCase().includes(term) ||
           e.rut.toLowerCase().includes(term);
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Gestión de Colaboradores</h2>
        <button onClick={() => openForm()} className="btn-primary flex items-center gap-2">
          <UserPlus className="w-5 h-5" /> Nuevo Colaborador
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar colaboradores..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredEmployees.map(employee => (
          <div key={employee.id} className={`card flex items-start gap-4 ${!employee.active ? 'opacity-60' : ''}`}>
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden shrink-0">
                {employee.photo_url ? (
                  <img src={employee.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xl">
                    {employee.first_name[0]}{employee.last_name[0]}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (employee.photo_url) {
                    // Ya tiene foto, puede actualizarla directo
                    setShowPhotoCapture(employee.id);
                  } else {
                    // Primera vez, pedir consentimiento
                    setShowConsent(employee);
                    setConsentAccepted(false);
                  }
                }}
                className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-primary-700"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 truncate">{employee.first_name} {employee.last_name}</p>
              <p className="text-sm text-gray-500">{employee.rut}</p>
              <p className="text-sm text-gray-400">{employee.department || '—'} · {employee.position || '—'}</p>
              {/* Consent status badge */}
              <div className="mt-1">
                {employee.consent_status === 'approved' && employee.photo_url && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">✓ Facial activo</span>
                )}
                {employee.consent_status === 'approved' && !employee.photo_url && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⚠ Autorizado sin foto</span>
                )}
                {employee.consent_status === 'rejected' && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">🔑 PIN activo</span>
                )}
                {(!employee.consent_status || employee.consent_status === 'pending') && (
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">⏳ Pendiente autorización</span>
                )}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => openForm(employee)} className="text-primary-600 hover:text-primary-800 p-1" title="Editar">
                  <Edit2 className="w-4 h-4" />
                </button>
                {employee.active ? (
                  <button onClick={() => setConfirmAction({ employee, action: 'deactivate' })}
                    className="text-red-500 hover:text-red-700 p-1" title="Desactivar">
                    <PowerOff className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={() => setConfirmAction({ employee, action: 'activate' })}
                    className="text-emerald-500 hover:text-emerald-700 p-1" title="Activar">
                    <Power className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setConfirmAction({ employee, action: 'delete' })}
                  className="text-gray-400 hover:text-red-600 p-1" title="Eliminar permanentemente">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {!employee.active && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full">Inactivo</span>
            )}
          </div>
        ))}
      </div>

      {/* Modal Formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">{editingEmployee ? 'Editar Colaborador' : 'Nuevo Colaborador'}</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl mb-4">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Documento</label>
                <select value={formData.doc_type} onChange={e => {
                    setFormData({...formData, doc_type: e.target.value, rut: ''});
                    setRutError('');
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none">
                  {DOC_TYPES.map(dt => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {DOC_TYPES.find(d => d.value === formData.doc_type)?.label || 'Documento'} *
                </label>
                <input value={formData.rut} onChange={e => {
                    const formatted = formatDocument(e.target.value, formData.doc_type);
                    setFormData({...formData, rut: formatted});
                    setRutError('');
                  }}
                  required placeholder={DOC_TYPES.find(d => d.value === formData.doc_type)?.placeholder}
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-primary-500 outline-none ${rutError ? 'border-red-400' : 'border-gray-200'}`} />
                {rutError && <p className="text-red-500 text-xs mt-1">{rutError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input value={formData.first_name} onChange={e => setFormData({...formData, first_name: capitalize(e.target.value)})}
                    required className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
                  <input value={formData.last_name} onChange={e => setFormData({...formData, last_name: capitalize(e.target.value)})}
                    required className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Área</label>
                <input value={formData.department} onChange={e => setFormData({...formData, department: capitalize(e.target.value)})}
                  placeholder="Ej: Operaciones, TI"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                <input value={formData.position} onChange={e => setFormData({...formData, position: capitalize(e.target.value)})}
                  placeholder="Ej: Analista, Supervisor"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value.toLowerCase()})}
                  placeholder="nombre@empresa.cl"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input type="tel" value={formData.phone} onChange={e => {
                    const formatted = formatPhone(e.target.value);
                    setFormData({...formData, phone: formatted});
                  }}
                  placeholder="+56 9 1234 5678"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <button type="submit" className="btn-primary w-full">
                {editingEmployee ? 'Guardar Cambios' : 'Crear Colaborador'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal Captura de Foto */}
      {showPhotoCapture && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Capturar Foto</h3>
              <button onClick={() => setShowPhotoCapture(null)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden bg-black mb-4">
              <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
                videoConstraints={{ width: 480, height: 480, facingMode: 'user' }}
                className="w-full" mirrored={true} />
            </div>
            <button onClick={() => capturePhoto(showPhotoCapture)} className="btn-primary w-full flex items-center justify-center gap-2">
              <Camera className="w-5 h-5" /> Capturar y Guardar
            </button>
          </div>
        </div>
      )}

      {/* Modal Foto post-creación */}
      {newEmployeePhoto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Camera className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold">¡Colaborador creado!</h3>
              <p className="text-gray-500 mt-1">
                Ahora toma una foto de <strong>{newEmployeePhoto.first_name} {newEmployeePhoto.last_name}</strong> para el reconocimiento facial
              </p>
            </div>
            <div className="rounded-2xl overflow-hidden bg-black mb-4">
              <Webcam ref={webcamNewRef} audio={false} screenshotFormat="image/jpeg"
                videoConstraints={{ width: 480, height: 480, facingMode: 'user' }}
                className="w-full" mirrored={true}
                onUserMediaError={() => console.error('Camera access denied')} />
            </div>
            <div className="space-y-3">
              <button onClick={() => captureNewEmployeePhoto()} className="btn-primary w-full flex items-center justify-center gap-2">
                <Camera className="w-5 h-5" /> Capturar Foto
              </button>
              <button onClick={() => { setNewEmployeePhoto(null); }} className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm">
                Omitir por ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar activar/desactivar/eliminar */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              confirmAction.action === 'activate' ? 'bg-emerald-100' : 'bg-red-100'
            }`}>
              {confirmAction.action === 'deactivate' && <PowerOff className="w-8 h-8 text-red-600" />}
              {confirmAction.action === 'activate' && <Power className="w-8 h-8 text-emerald-600" />}
              {confirmAction.action === 'delete' && <Trash2 className="w-8 h-8 text-red-600" />}
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {confirmAction.action === 'deactivate' && '¿Desactivar colaborador?'}
              {confirmAction.action === 'activate' && '¿Activar colaborador?'}
              {confirmAction.action === 'delete' && '¿Eliminar colaborador permanentemente?'}
            </h3>
            <p className="text-gray-500 mb-4">
              {confirmAction.action === 'deactivate'
                && `${confirmAction.employee.first_name} ${confirmAction.employee.last_name} no podrá registrar asistencia.`}
              {confirmAction.action === 'activate'
                && `${confirmAction.employee.first_name} ${confirmAction.employee.last_name} podrá volver a registrar asistencia.`}
              {confirmAction.action === 'delete'
                && `${confirmAction.employee.first_name} ${confirmAction.employee.last_name} será eliminado del sistema junto con todos sus registros.`}
            </p>
            {confirmAction.action === 'delete' && (
              <p className="text-xs text-red-500 mb-4">⚠️ Esta acción no se puede deshacer.</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all">
                Cancelar
              </button>
              <button onClick={handleToggleActive}
                className={`flex-1 py-3 text-white rounded-xl font-medium transition-all ${
                  confirmAction.action === 'activate'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}>
                {confirmAction.action === 'deactivate' && 'Desactivar'}
                {confirmAction.action === 'activate' && 'Activar'}
                {confirmAction.action === 'delete' && 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Consentimiento enviado */}
      {showConsent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <Shield className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Colaborador creado</h3>
            <p className="text-sm text-gray-600 mb-4">
              Se ha enviado un correo de verificación a <strong>{showConsent.email || 'el colaborador'}</strong> para que confirme su identidad y autorice el uso de reconocimiento facial.
            </p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-left">
              <p className="text-xs text-gray-500 mb-1 font-medium">El trabajador debe:</p>
              <ul className="text-xs text-gray-600 space-y-1 pl-3">
                <li>1. Abrir el correo que recibió</li>
                <li>2. Tomarse una selfie desde su celular</li>
                <li>3. Autorizar el reconocimiento facial (o elegir PIN)</li>
              </ul>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              El reconocimiento facial solo se habilitará cuando el trabajador autorice. Esta decisión es 100% responsabilidad del colaborador.
            </p>
            <button
              onClick={() => setShowConsent(null)}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-all"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal PIN Asignado */}
      {pinAssigned && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <KeyRound className="w-8 h-8 text-primary-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">PIN asignado correctamente</h3>
            <p className="text-sm text-gray-500 mb-5">Para: <strong>{pinAssigned.name}</strong></p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-5">
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">PIN personal</p>
              <p className="text-4xl font-bold text-primary-600 tracking-[0.3em] font-mono">{pinAssigned.pin}</p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 text-left">
              <p className="text-xs text-gray-400 mb-1">URL de marcaje</p>
              <p className="text-sm font-medium text-primary-600">{pinAssigned.url}</p>
            </div>

            {pinAssigned.hasEmail && (
              <p className="text-sm text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg mb-5">
                Se envió esta información al email del colaborador.
              </p>
            )}

            <button
              onClick={() => setPinAssigned(null)}
              className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
