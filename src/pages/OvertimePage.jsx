import { useState } from 'react';
import { Clock, Download, Search, AlertTriangle } from 'lucide-react';
import { attendanceApi } from '../api';

export default function OvertimePage() {
  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getToday());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function getToday() {
    return new Date().toISOString().split('T')[0];
  }

  function getFirstDayOfMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  async function loadOvertime() {
    setLoading(true);
    setError('');
    try {
      const result = await attendanceApi.getOvertime({ start_date: startDate, end_date: endDate });
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function exportCSV() {
    if (!data || !data.employees.length) return;
    const headers = ['RUT', 'Nombre', 'Apellido', 'Área', 'Días trabajados', 'Horas trabajadas', 'Horas extra'];
    const rows = data.employees.map(emp => [
      emp.rut,
      emp.first_name,
      emp.last_name,
      emp.department || '',
      emp.days_worked,
      `${emp.total_worked_hours}:${String(emp.total_worked_minutes).padStart(2, '0')}`,
      `${emp.total_overtime_hours}:${String(emp.total_overtime_minutes).padStart(2, '0')}`,
    ]);

    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `horas-extra_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Horas Extra</h2>
          <p className="text-sm text-gray-500 mt-1">Cálculo basado en registros de entrada y salida</p>
        </div>
        {data && data.employees.length > 0 && (
          <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-all">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <button
            onClick={loadOvertime}
            disabled={loading}
            className="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all disabled:opacity-50"
          >
            {loading ? 'Calculando...' : 'Calcular'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-6">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Resultados */}
      {data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Período</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{startDate} al {endDate}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Colaboradores</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary.total_employees}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Con horas extra</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{data.summary.employees_with_overtime}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Jornada base</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{data.schedule.entry_time} - {data.schedule.exit_time}</p>
            </div>
          </div>

          {/* Table */}
          {data.employees.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay registros en este período</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Colaborador</th>
                    <th className="px-4 py-3">Días</th>
                    <th className="px-4 py-3">Horas trabajadas</th>
                    <th className="px-4 py-3">Horas extra</th>
                  </tr>
                </thead>
                <tbody>
                  {data.employees.map(emp => (
                    <tr key={emp.employee_id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-gray-400">{emp.rut} · {emp.department || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{emp.days_worked}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {emp.total_worked_hours}h {emp.total_worked_minutes}m
                      </td>
                      <td className="px-4 py-3">
                        {emp.total_overtime_hours > 0 || emp.total_overtime_minutes > 0 ? (
                          <span className="text-sm font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">
                            {emp.total_overtime_hours}h {emp.total_overtime_minutes}m
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
