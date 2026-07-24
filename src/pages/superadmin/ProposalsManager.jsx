import { useState, useEffect } from 'react';
import { FileText, Plus, Send, Check, X, Copy, ExternalLink, Edit2, Trash2, ArrowLeft } from 'lucide-react';

function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
}

export default function ProposalsManager({ onBack }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [copied, setCopied] = useState(null);
  const [form, setForm] = useState(getEmptyForm());

  function getEmptyForm() {
    return {
      company_name: '', company_rut: '', contact_name: '', contact_email: '', contact_phone: '',
      num_employees: 10, price_per_user: 1490, minimum_monthly: 29900,
      discount_percent: 0, annual_discount_percent: 20, setup_fee: 0,
      trial_days: 15, min_contract_months: 0, cancellation_days: 15,
      notes: '', valid_until: '',
    };
  }

  useEffect(() => { loadProposals(); }, []);

  async function loadProposals() {
    try {
      const secret = sessionStorage.getItem('superadmin_token');
      const res = await fetch('/api/proposals', {
        headers: { 'x-admin-secret': secret },
      });
      if (res.ok) {
        const data = await res.json();
        setProposals(data);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const secret = sessionStorage.getItem('superadmin_token');

    const method = editingId ? 'PUT' : 'POST';
    const body = editingId ? { id: editingId, ...form } : form;

    const res = await fetch('/api/proposals', {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setShowForm(false);
      setEditingId(null);
      setForm(getEmptyForm());
      loadProposals();
    } else {
      const err = await res.json();
      alert(err.error || 'Error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta propuesta?')) return;
    const secret = sessionStorage.getItem('superadmin_token');
    await fetch('/api/proposals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ id }),
    });
    loadProposals();
  }

  function startEdit(p) {
    setForm({
      company_name: p.company_name, company_rut: p.company_rut || '',
      contact_name: p.contact_name || '', contact_email: p.contact_email || '',
      contact_phone: p.contact_phone || '', num_employees: p.num_employees,
      price_per_user: p.price_per_user, minimum_monthly: p.minimum_monthly,
      discount_percent: p.discount_percent || 0, annual_discount_percent: p.annual_discount_percent || 20,
      setup_fee: p.setup_fee || 0, trial_days: p.trial_days || 15,
      min_contract_months: p.min_contract_months || 0, cancellation_days: p.cancellation_days || 15,
      notes: p.notes || '', valid_until: p.valid_until ? p.valid_until.split('T')[0] : '',
    });
    setEditingId(p.id);
    setShowForm(true);
  }

  function copyLink(reference) {
    navigator.clipboard.writeText(`https://www.flexio.cl/propuesta/${reference}`);
    setCopied(reference);
    setTimeout(() => setCopied(null), 2000);
  }

  const statusColors = {
    draft: 'bg-gray-600 text-gray-200',
    sent: 'bg-blue-600 text-blue-100',
    accepted: 'bg-emerald-600 text-emerald-100',
    rejected: 'bg-red-600 text-red-100',
    expired: 'bg-amber-600 text-amber-100',
  };

  const statusLabels = {
    draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada', expired: 'Expirada',
  };

  // Calculate live preview
  const rawMonthly = form.num_employees * form.price_per_user;
  const previewMonthly = Math.max(rawMonthly, form.minimum_monthly);
  const previewDiscounted = form.discount_percent > 0 ? Math.round(previewMonthly * (1 - form.discount_percent / 100)) : previewMonthly;
  const previewIva = Math.round(previewDiscounted * 1.19);
  const minimumApplied = rawMonthly < form.minimum_monthly;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold">Propuestas Comerciales</h2>
          <span className="text-sm text-gray-500">({proposals.length})</span>
        </div>
        <button
          onClick={() => { setForm(getEmptyForm()); setEditingId(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Nueva Propuesta
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between sticky top-0 bg-gray-800 z-10">
              <h3 className="text-lg font-bold">{editingId ? 'Editar' : 'Nueva'} Propuesta</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Client info */}
              <div>
                <h4 className="text-sm font-semibold text-gray-400 uppercase mb-3">Datos del cliente</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})}
                    placeholder="Nombre empresa *" required
                    className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none" />
                  <input value={form.company_rut} onChange={e => setForm({...form, company_rut: e.target.value})}
                    placeholder="RUT empresa"
                    className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none" />
                  <input value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})}
                    placeholder="Nombre contacto"
                    className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none" />
                  <input value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})}
                    placeholder="Email contacto" type="email"
                    className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none" />
                  <input value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})}
                    placeholder="Teléfono"
                    className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none" />
                </div>
              </div>

              {/* Pricing */}
              <div>
                <h4 className="text-sm font-semibold text-gray-400 uppercase mb-3">Pricing</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">N° Colaboradores *</label>
                    <input type="number" min="1" value={form.num_employees} onChange={e => setForm({...form, num_employees: parseInt(e.target.value) || 1})}
                      required className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">$/usuario/mes</label>
                    <input type="number" min="0" value={form.price_per_user} onChange={e => setForm({...form, price_per_user: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Mínimo mensual</label>
                    <input type="number" min="0" value={form.minimum_monthly} onChange={e => setForm({...form, minimum_monthly: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Descuento mensual %</label>
                    <input type="number" min="0" max="100" value={form.discount_percent} onChange={e => setForm({...form, discount_percent: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Descuento anual %</label>
                    <input type="number" min="0" max="100" value={form.annual_discount_percent} onChange={e => setForm({...form, annual_discount_percent: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cobro setup ($)</label>
                    <input type="number" min="0" value={form.setup_fee} onChange={e => setForm({...form, setup_fee: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                </div>

                {/* Live preview */}
                <div className="mt-4 p-4 bg-gray-900 border border-gray-700 rounded-xl">
                  <p className="text-xs text-gray-500 mb-2">Vista previa del precio</p>
                  <div className="flex items-baseline gap-3">
                    <span className="text-2xl font-bold text-emerald-400">{formatCLP(previewIva)}</span>
                    <span className="text-sm text-gray-500">/mes IVA incl.</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {form.num_employees} × {formatCLP(form.price_per_user)} = {formatCLP(rawMonthly)} neto
                    {minimumApplied && <span className="text-amber-400"> (se aplica mínimo {formatCLP(form.minimum_monthly)})</span>}
                    {form.discount_percent > 0 && <span className="text-emerald-400"> -{form.discount_percent}% desc.</span>}
                  </p>
                </div>
              </div>

              {/* Terms */}
              <div>
                <h4 className="text-sm font-semibold text-gray-400 uppercase mb-3">Condiciones</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Trial (días)</label>
                    <input type="number" min="0" value={form.trial_days} onChange={e => setForm({...form, trial_days: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Contrato mín (meses)</label>
                    <input type="number" min="0" value={form.min_contract_months} onChange={e => setForm({...form, min_contract_months: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Aviso término (días)</label>
                    <input type="number" min="0" value={form.cancellation_days} onChange={e => setForm({...form, cancellation_days: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Válida hasta</label>
                    <input type="date" value={form.valid_until} onChange={e => setForm({...form, valid_until: e.target.value})}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notas internas</label>
                <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                  placeholder="Notas, contexto, acuerdos especiales..."
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none resize-none" />
              </div>

              <div className="flex gap-3">
                <button type="submit" className="flex-1 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition">
                  {editingId ? 'Guardar cambios' : 'Crear propuesta'}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 transition">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Proposals List */}
      {loading ? (
        <p className="text-gray-500 text-center py-8">Cargando...</p>
      ) : proposals.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No hay propuestas aún</p>
          <button onClick={() => setShowForm(true)} className="mt-4 text-primary-400 hover:text-primary-300 text-sm">
            Crear la primera
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map(p => (
            <div key={p.id} className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-white truncate">{p.company_name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[p.status] || statusColors.draft}`}>
                      {statusLabels[p.status] || p.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">
                    {p.num_employees} colaboradores · {formatCLP(p.calculated?.monthly_iva || 0)}/mes IVA incl.
                    {p.calculated?.minimum_applied && <span className="text-amber-400 ml-1">(mínimo)</span>}
                  </p>
                  {p.contact_name && <p className="text-xs text-gray-500 mt-1">{p.contact_name} · {p.contact_email || p.contact_phone}</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => copyLink(p.reference)} title="Copiar link"
                    className={`p-2 rounded-lg transition ${copied === p.reference ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}>
                    {copied === p.reference ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a href={`/propuesta/${p.reference}`} target="_blank" rel="noopener noreferrer" title="Ver propuesta"
                    className="p-2 bg-gray-700 text-gray-400 hover:text-white rounded-lg transition">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => startEdit(p)} title="Editar"
                    className="p-2 bg-gray-700 text-gray-400 hover:text-white rounded-lg transition">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} title="Eliminar"
                    className="p-2 bg-gray-700 text-gray-400 hover:text-red-400 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Reference & link */}
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                <span>Ref: {p.reference}</span>
                <span>·</span>
                <span>flexio.cl/propuesta/{p.reference}</span>
                {p.valid_until && (
                  <>
                    <span>·</span>
                    <span>Vence: {new Date(p.valid_until).toLocaleDateString('es-CL')}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
