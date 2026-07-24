import { useState, useEffect } from 'react';
import { AlertTriangle, FileText, Plus, Trash2, Eye, Printer, Users, Filter } from 'lucide-react';

export default function WarningsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [threshold, setThreshold] = useState(3);
  const [showLetter, setShowLetter] = useState(null); // HTML string
  const [creating, setCreating] = useState(null); // employee infraction object
  const [tab, setTab] = useState('infractions'); // 'infractions' | 'history'

  useEffect(() => { loadData(); }, [period, threshold]);

  async function loadData() {
    setLoading(true);
    try {
      const slug = window.location.pathname.match(/\/admin\/([^/]+)/)?.[1];
      const res = await fetch(`/api/warnings?period=${period}&threshold=${threshold}`, {
        headers: slug ? { 'x-tenant-slug': slug } : {},
      });
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function createWarning(infraction) {
    const slug = window.location.pathname.match(/\/admin\/([^/]+)/)?.[1];
    const reason = `Acumulación de ${infraction.tardy_count} atrasos en el período ${data.period.start} al ${data.period.end}.`;

    const res = await fetch('/api/warnings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(slug ? { 'x-tenant-slug': slug } : {}) },
      body: JSON.stringify({
        employee_id: infraction.employee_id,
        type: 'tardiness',
        reason,
        infraction_count: infraction.tardy_count,
        period_start: data.period.start,
        period_end: data.period.end,
      }),
    });

    if (res.ok) {
      const result = await res.json();
      setShowLetter(result.letter_html);
      setCreating(null);
      loadData();
    } else {
      const err = await res.json();
      alert(err.error || 'Error al crear');
    }
  }

  async function deleteWarning(id) {
    if (!confirm('¿Eliminar esta amonestación?')) return;
    const slug = window.location.pathname.match(/\/admin\/([^/]+)/)?.[1];
    await fetch('/api/warnings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(slug ? { 'x-tenant-slug': slug } : {}) },
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  function printLetter(html) {
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.setTimeout(() => win.print(), 500);
  }

  const periodLabels = { week: 'Esta semana', month: 'Este mes', trimester: 'Este trimestre' };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Amonestaciones</h2>
          <p className="text-sm text-gray-500 mt-1">Cartas de amonestación por atrasos y ausencias</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('infractions')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'infractions' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <AlertTriangle className="w-4 h-4 inline mr-1.5" />Infracciones
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'history' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          <FileText className="w-4 h-4 inline mr-1.5" />Historial cartas
        </button>
      </div>

      {/* Filters */}
      {tab === 'infractions' && (
        <div className="flex flex-wrap items-center gap-3 mb-6 bg-gray-50 p-4 rounded-xl">
          <Filter className="w-4 h-4 text-gray-400" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Período:</label>
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none">
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
              <option value="trimester">Este trimestre</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Umbral atrasos:</label>
            <select value={threshold} onChange={e => setThreshold(parseInt(e.target.value))}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none">
              <option value="2">2+ atrasos</option>
              <option value="3">3+ atrasos</option>
              <option value="5">5+ atrasos</option>
              <option value="7">7+ atrasos</option>
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : !data ? (
        <div className="text-center py-12 text-gray-400">Error al cargar datos</div>
      ) : (
        <>
          {/* INFRACTIONS TAB */}
          {tab === 'infractions' && (
            <>
              {data.infractions.length === 0 ? (
                <div className="text-center py-16">
                  <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Sin infracciones en este período</p>
                  <p className="text-gray-400 text-sm mt-1">Ningún colaborador supera {threshold} atrasos ({periodLabels[period]})</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 mb-2">
                    {data.infractions.length} colaborador(es) con {threshold}+ atrasos ({periodLabels[period]})
                  </p>

                  {data.infractions.map(inf => (
                    <div key={inf.employee_id} className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-gray-900">{inf.first_name} {inf.last_name}</h3>
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                              {inf.tardy_count} atrasos
                            </span>
                            {inf.existing_warnings > 0 && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                {inf.existing_warnings} carta(s) previa(s)
                              </span>
                            )}
                            {inf.can_terminate && (
                              <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-medium">
                                Causal despido
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            {inf.rut || ''}{inf.department ? ` · ${inf.department}` : ''}
                          </p>
                        </div>

                        <button
                          onClick={() => setCreating(inf)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition shrink-0"
                        >
                          <FileText className="w-4 h-4" />
                          Generar carta
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* HISTORY TAB */}
          {tab === 'history' && (
            <>
              {data.warnings.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Sin cartas emitidas</p>
                  <p className="text-gray-400 text-sm mt-1">Las amonestaciones generadas aparecerán aquí</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.warnings.map(w => (
                    <div key={w.id} className="bg-white border border-gray-200 rounded-xl p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900">{w.reason}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {w.type === 'tardiness' ? 'Atrasos' : w.type === 'absence' ? 'Inasistencias' : 'Otra'}
                            {w.infraction_count > 0 && ` · ${w.infraction_count} infracciones`}
                            {w.period_start && ` · ${new Date(w.period_start).toLocaleDateString('es-CL')} - ${new Date(w.period_end).toLocaleDateString('es-CL')}`}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Creada: {new Date(w.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {w.letter_html && (
                            <>
                              <button onClick={() => setShowLetter(w.letter_html)} title="Ver carta"
                                className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition">
                                <Eye className="w-4 h-4" />
                              </button>
                              <button onClick={() => printLetter(w.letter_html)} title="Imprimir"
                                className="p-2 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg transition">
                                <Printer className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button onClick={() => deleteWarning(w.id)} title="Eliminar"
                            className="p-2 bg-gray-100 text-red-500 hover:bg-red-50 rounded-lg transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* CONFIRM CREATE MODAL */}
      {creating && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Generar carta de amonestación</h3>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="font-medium text-gray-900">{creating.first_name} {creating.last_name}</p>
              <p className="text-sm text-gray-500">{creating.rut} · {creating.department || ''}</p>
              <p className="text-sm text-red-600 mt-2 font-medium">{creating.tardy_count} atrasos en el período</p>
              {creating.existing_warnings > 0 && (
                <p className="text-sm text-amber-600 mt-1">Ya tiene {creating.existing_warnings} carta(s) previa(s)</p>
              )}
              {creating.can_terminate && (
                <p className="text-sm text-red-700 font-bold mt-1">Esta será la 3ra carta — habilita desvinculación</p>
              )}
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Se generará una carta formal de amonestación por atrasos reiterados. El documento quedará en el historial del colaborador.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => createWarning(creating)}
                className="flex-1 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition"
              >
                Confirmar y generar
              </button>
              <button
                onClick={() => setCreating(null)}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LETTER PREVIEW MODAL */}
      {showLetter && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-gray-900">Carta de Amonestación</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => printLetter(showLetter)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition">
                  <Printer className="w-4 h-4" /> Imprimir / PDF
                </button>
                <button onClick={() => setShowLetter(null)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition">
                  Cerrar
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2">
              <iframe
                srcDoc={showLetter}
                className="w-full h-full min-h-[600px] border border-gray-200 rounded-lg"
                title="Carta de amonestación"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
