import { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, Filter, Trash2, AlertTriangle, Camera, X, Edit2, Upload, FileSpreadsheet } from 'lucide-react';
import { attendanceApi, bulkMarksApi } from '../api';
import { useToast } from '../components/Toast';

export default function AttendancePage() {
  const [records, setRecords] = useState([]);
  const [viewPhoto, setViewPhoto] = useState(null);
  const [view, setView] = useState('today');
  const [deleteRecord, setDeleteRecord] = useState(null);
  const [editRecord, setEditRecord] = useState(null);
  const [editTimestamp, setEditTimestamp] = useState('');
  const [showBulkMarks, setShowBulkMarks] = useState(false);
  const [bulkData, setBulkData] = useState(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [filters, setFilters] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    type: '',
  });

  useEffect(() => { loadRecords(); }, [view, filters]);

  async function loadRecords() {
    try {
      if (view === 'today') {
        const data = await attendanceApi.getToday();
        setRecords(data);
      } else {
        const params = {};
        if (filters.start_date) params.start_date = filters.start_date;
        if (filters.end_date) params.end_date = filters.end_date;
        if (filters.type) params.type = filters.type;
        const data = await attendanceApi.getHistory(params);
        setRecords(data);
      }
    } catch (err) { console.error(err); }
  }

  async function handleDelete() {
    if (!deleteRecord) return;
    setDeleting(true);
    try {
      await attendanceApi.delete(deleteRecord.id);
      setDeleteRecord(null);
      loadRecords();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  async function handleEdit() {
    if (!editRecord || !editTimestamp) return;
    setEditing(true);
    try {
      await attendanceApi.edit(editRecord.id, editTimestamp);
      setEditRecord(null);
      setEditTimestamp('');
      loadRecords();
    } catch (err) {
      console.error(err);
    } finally {
      setEditing(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Registros de Asistencia</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowBulkMarks(true)}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
            <Upload className="w-4 h-4" /> Carga masiva
          </button>
          <button onClick={() => setView('today')}
            className={`px-4 py-2 rounded-xl font-medium transition-all ${view === 'today' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Hoy
          </button>
          <button onClick={() => setView('history')}
            className={`px-4 py-2 rounded-xl font-medium transition-all ${view === 'history' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            Historial
          </button>
        </div>
      </div>

      {view === 'history' && (
        <div className="card mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-700">Filtros</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Desde</label>
              <input type="date" value={filters.start_date}
                onChange={(e) => setFilters(f => ({ ...f, start_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Hasta</label>
              <input type="date" value={filters.end_date}
                onChange={(e) => setFilters(f => ({ ...f, end_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Tipo</label>
              <select value={filters.type}
                onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl">
                <option value="">Todos</option>
                <option value="entry">Entradas</option>
                <option value="exit">Salidas</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Colaborador</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Tipo</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Fecha/Hora</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Área</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map(record => (
                <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0">
                        {record.photo_url ? (
                          <img src={record.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-sm">
                            {record.first_name?.[0]}{record.last_name?.[0]}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{record.first_name} {record.last_name}</p>
                        <p className="text-xs text-gray-400">{record.rut}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                      record.type === 'entry' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'
                    }`}>
                      {record.type === 'entry' ? <><LogIn className="w-4 h-4" /> Entrada</> : <><LogOut className="w-4 h-4" /> Salida</>}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>{new Date(record.timestamp).toLocaleString('es-CL')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{record.department || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {record.photo_snapshot_url && (
                        <button
                          onClick={() => setViewPhoto({ url: record.photo_snapshot_url, name: `${record.first_name} ${record.last_name}`, time: new Date(record.timestamp).toLocaleString('es-CL'), type: record.type })}
                          className="p-2 text-primary-500 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-all"
                          title="Ver foto del marcaje"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => { setEditRecord(record); setEditTimestamp(new Date(record.timestamp).toISOString().slice(0, 16)); }}
                        className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                        title="Editar hora"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteRecord(record)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Eliminar registro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan="5" className="text-center py-12 text-gray-400">No hay registros para mostrar</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Confirmar eliminación */}
      {deleteRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar este registro?</h3>
            <p className="text-gray-500 mb-2">
              {deleteRecord.type === 'entry' ? 'Entrada' : 'Salida'} de <strong>{deleteRecord.first_name} {deleteRecord.last_name}</strong>
            </p>
            <p className="text-sm text-gray-400 mb-6">
              {new Date(deleteRecord.timestamp).toLocaleString('es-CL')}
            </p>
            <p className="text-xs text-red-500 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteRecord(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all disabled:opacity-50">
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Editar registro */}
      {editRecord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Editar Registro</h3>
            <p className="text-sm text-gray-500 mb-4">
              {editRecord.type === 'entry' ? 'Entrada' : 'Salida'} de <strong>{editRecord.first_name} {editRecord.last_name}</strong>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha y hora</label>
              <input
                type="datetime-local"
                value={editTimestamp}
                onChange={e => setEditTimestamp(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setEditRecord(null); setEditTimestamp(''); }}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all">
                Cancelar
              </button>
              <button onClick={handleEdit} disabled={editing || !editTimestamp}
                className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-all disabled:opacity-50">
                {editing ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver foto del marcaje */}
      {viewPhoto && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setViewPhoto(null)}>
          <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="relative">
              <img src={viewPhoto.url} alt="Foto marcaje" className="w-full aspect-[4/3] object-cover" />
              <button onClick={() => setViewPhoto(null)} className="absolute top-3 right-3 w-8 h-8 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <p className="text-white font-medium">{viewPhoto.name}</p>
                <p className="text-white/80 text-sm">{viewPhoto.type === 'entry' ? 'Entrada' : 'Salida'} · {viewPhoto.time}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Marks Modal */}
      {showBulkMarks && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Carga Masiva de Marcas</h3>
                <p className="text-sm text-gray-500 mt-1">Importa registros históricos o correcciones</p>
              </div>
              <button onClick={() => { setShowBulkMarks(false); setBulkData(null); }} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {!bulkData ? (
                <div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                    <p className="text-sm font-medium text-blue-800 mb-2">Formato del archivo CSV:</p>
                    <code className="text-xs text-blue-700 block bg-blue-100 p-3 rounded-lg overflow-x-auto">
                      RUT,Fecha,Entrada,Salida,Notas<br/>
                      17.339.278-8,2026-07-01,08:30,17:30,Normal<br/>
                      12.345.678-9,2026-07-01,08:45,18:00,Llegó tarde
                    </code>
                    <p className="text-xs text-blue-600 mt-2">Fecha en formato YYYY-MM-DD. Hora en HH:MM.</p>
                  </div>
                  <label className="block w-full border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition">
                    <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700">Click para seleccionar archivo CSV</p>
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const lines = ev.target.result.trim().split(/\r?\n/);
                        if (lines.length < 2) return;
                        const sep = lines[0].includes(';') ? ';' : ',';
                        const parsed = [];
                        for (let i = 1; i < lines.length; i++) {
                          const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
                          if (cols.length >= 3) {
                            parsed.push({ rut: cols[0], date: cols[1], entry_time: cols[2], exit_time: cols[3] || '', notes: cols[4] || '' });
                          }
                        }
                        setBulkData(parsed);
                      };
                      reader.readAsText(file, 'UTF-8');
                    }} />
                  </label>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3">{bulkData.length} registros detectados</p>
                  <div className="overflow-x-auto border border-gray-200 rounded-xl max-h-60">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr><th className="px-2 py-2">RUT</th><th className="px-2 py-2">Fecha</th><th className="px-2 py-2">Entrada</th><th className="px-2 py-2">Salida</th></tr>
                      </thead>
                      <tbody>
                        {bulkData.slice(0, 20).map((r, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-2 py-1.5">{r.rut}</td>
                            <td className="px-2 py-1.5">{r.date}</td>
                            <td className="px-2 py-1.5">{r.entry_time}</td>
                            <td className="px-2 py-1.5">{r.exit_time || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bulkData.length > 20 && <p className="text-xs text-gray-400 mt-2">... y {bulkData.length - 20} más</p>}
                </div>
              )}
            </div>
            {bulkData && (
              <div className="p-6 border-t border-gray-100 flex gap-3">
                <button
                  onClick={async () => {
                    setBulkImporting(true);
                    try {
                      const result = await bulkMarksApi.import({ marks: bulkData });
                      toast.success(result.message);
                      setShowBulkMarks(false);
                      setBulkData(null);
                      loadRecords();
                    } catch (e) { toast.error(e.message); }
                    finally { setBulkImporting(false); }
                  }}
                  disabled={bulkImporting}
                  className="flex-1 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition disabled:opacity-50"
                >
                  {bulkImporting ? 'Importando...' : `Importar ${bulkData.length} registros`}
                </button>
                <button onClick={() => setBulkData(null)} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition">
                  Cambiar archivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
