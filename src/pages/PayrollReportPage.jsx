import { useState } from 'react';
import { DollarSign, Download, Loader, Calendar } from 'lucide-react';
import { payrollApi } from '../api';
import { useToast } from '../components/Toast';
import * as XLSX from 'xlsx';

export default function PayrollReportPage() {
  const [startDate, setStartDate] = useState(getFirstDayOfMonth());
  const [endDate, setEndDate] = useState(getToday());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  function getToday() { return new Date().toISOString().split('T')[0]; }
  function getFirstDayOfMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  async function generate() {
    setLoading(true);
    try {
      const result = await payrollApi.getReport({ start_date: startDate, end_date: endDate });
      setData(result);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }

  function exportExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const rows = [[
      'RUT', 'Nombre', 'Apellido', 'Departamento', 'Cargo',
      'Días Hábiles', 'Días Trabajados', 'Días Remunerados', 'Días No Remunerados',
      'Ausencias Injust.', 'Justificadas', 'Licencia Médica',
      'Horas Regulares', 'HE 50%', 'HE 100%', 'Atrasos',
    ]];

    for (const emp of data.employees) {
      rows.push([
        emp.rut || '', emp.first_name, emp.last_name, emp.department || '', emp.position || '',
        emp.working_days_in_period, emp.days_worked, emp.days_remunerated, emp.days_not_remunerated,
        emp.days_absent_unjustified, emp.days_justified, emp.days_medical_leave,
        emp.regular_hours, emp.overtime_50_hours, emp.overtime_100_hours, emp.late_arrivals,
      ]);
    }

    // Totals row
    rows.push([]);
    rows.push([
      '', '', 'TOTALES', '', '',
      '', data.employees.reduce((s, e) => s + e.days_worked, 0),
      data.employees.reduce((s, e) => s + e.days_remunerated, 0),
      data.employees.reduce((s, e) => s + e.days_not_remunerated, 0),
      data.employees.reduce((s, e) => s + e.days_absent_unjustified, 0),
      data.employees.reduce((s, e) => s + e.days_justified, 0),
      data.employees.reduce((s, e) => s + e.days_medical_leave, 0),
      data.employees.reduce((s, e) => s + e.regular_hours, 0),
      data.employees.reduce((s, e) => s + e.overtime_50_hours, 0),
      data.employees.reduce((s, e) => s + e.overtime_100_hours, 0),
      data.employees.reduce((s, e) => s + e.late_arrivals, 0),
    ]);

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Remuneraciones');
    XLSX.writeFile(wb, `Flexio-Remuneraciones-${startDate}-${endDate}.xlsx`);
    toast.success('Excel descargado');
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reporte de Remuneraciones</h2>
          <p className="text-sm text-gray-500 mt-1">Días remunerados, ausencias, horas extra desglosadas — listo para el contador</p>
        </div>
        {data && (
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <button onClick={generate} disabled={loading}
          className="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition disabled:opacity-50">
          {loading ? 'Generando...' : 'Generar'}
        </button>
      </div>

      {/* Results */}
      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Período</p>
              <p className="text-sm font-semibold text-gray-900 mt-1">{data.period.working_days} días hábiles</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Feriados en período</p>
              <p className="text-xl font-bold text-primary-600 mt-1">{data.period.holidays}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Colaboradores</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{data.employees.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-orange-200 p-4">
              <p className="text-xs text-gray-500">Total HE (50%+100%)</p>
              <p className="text-xl font-bold text-orange-600 mt-1">
                {Math.round(data.employees.reduce((s, e) => s + e.overtime_50_hours + e.overtime_100_hours, 0))}h
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase bg-gray-50">
                  <th className="px-3 py-3 sticky left-0 bg-gray-50">Colaborador</th>
                  <th className="px-3 py-3 text-center">Trabajados</th>
                  <th className="px-3 py-3 text-center bg-emerald-50 text-emerald-700">Remunerados</th>
                  <th className="px-3 py-3 text-center bg-red-50 text-red-700">No Remun.</th>
                  <th className="px-3 py-3 text-center">Justif.</th>
                  <th className="px-3 py-3 text-center">Licencia</th>
                  <th className="px-3 py-3 text-center">Hrs Reg.</th>
                  <th className="px-3 py-3 text-center bg-orange-50 text-orange-700">HE 50%</th>
                  <th className="px-3 py-3 text-center bg-red-50 text-red-700">HE 100%</th>
                  <th className="px-3 py-3 text-center">Atrasos</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map(emp => (
                  <tr key={emp.employee_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-3 sticky left-0 bg-white">
                      <p className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-400">{emp.rut} · {emp.department || ''}</p>
                    </td>
                    <td className="px-3 py-3 text-center">{emp.days_worked}</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-700 bg-emerald-50/50">{emp.days_remunerated}</td>
                    <td className="px-3 py-3 text-center font-semibold text-red-600 bg-red-50/50">{emp.days_not_remunerated || 0}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{emp.days_justified || 0}</td>
                    <td className="px-3 py-3 text-center text-gray-600">{emp.days_medical_leave || 0}</td>
                    <td className="px-3 py-3 text-center">{emp.regular_hours}h</td>
                    <td className="px-3 py-3 text-center bg-orange-50/50">
                      {emp.overtime_50_hours > 0 ? <span className="font-semibold text-orange-600">{emp.overtime_50_hours}h</span> : '—'}
                    </td>
                    <td className="px-3 py-3 text-center bg-red-50/50">
                      {emp.overtime_100_hours > 0 ? <span className="font-semibold text-red-600">{emp.overtime_100_hours}h</span> : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {emp.late_arrivals > 0 ? <span className="text-amber-600 font-medium">{emp.late_arrivals}</span> : '0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            HE 50% = horas extra día hábil · HE 100% = horas extra domingo/feriado · Remunerados = trabajados + justificados + licencia
          </p>
        </>
      )}
    </div>
  );
}
