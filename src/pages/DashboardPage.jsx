import { useState, useEffect } from 'react';
import { Users, UserCheck, UserX, Clock, TrendingUp, AlertTriangle, Award, Calendar, Download, BarChart3, Timer, Building2 } from 'lucide-react';
import { attendanceApi, employeesApi } from '../api';
import * as XLSX from 'xlsx';

const TABS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

export default function DashboardPage() {
  const [tab, setTab] = useState('today');
  const [report, setReport] = useState(null);
  const [todaySummary, setTodaySummary] = useState(null);
  const [absentToday, setAbsentToday] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [tab]);

  // Auto-refresh every 30s for today tab
  useEffect(() => {
    if (tab !== 'today') return;
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [tab]);

  async function loadData() {
    setLoading(true);
    try {
      if (tab === 'today') {
        const [summary, allEmployees, todayRecords] = await Promise.all([
          attendanceApi.getSummary(),
          employeesApi.getAll({ active: '1' }),
          attendanceApi.getToday(),
        ]);
        setTodaySummary(summary);
        const presentIds = new Set(todayRecords.map(r => r.employee_id));
        setAbsentToday(allEmployees.filter(e => !presentIds.has(e.id)));
      }
      const data = await attendanceApi.getReports(tab);
      setReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function exportExcel() {
    if (!report) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Resumen General
    const resumenData = [
      ['REPORTE DE ASISTENCIA — FLEXIO'],
      [],
      ['Período', `${report.start_date} al ${report.end_date}`],
      ['Días hábiles', report.working_days],
      ['Total colaboradores', report.overview.total_employees],
      ['Tasa de asistencia', `${report.overview.attendance_rate}%`],
      ['Hora promedio de ingreso', report.overview.avg_entry_time],
      ['Total llegadas tarde', report.overview.total_late],
      ['Total días de ausencia', report.overview.total_absent_days],
      ['Empleados siempre puntuales', report.overview.punctual_employees],
      [],
      ['Horario configurado', `${report.schedule.entry_time} (tolerancia: ${report.schedule.tolerance_minutes} min)`],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    // Sheet 2: Detalle por Colaborador
    const detalleRows = [['Nombre', 'Apellido', 'Departamento', 'Días Presentes', 'Días Ausentes', 'Atrasos', 'Min. Atraso Total', 'Llegadas Temprano', 'Tasa Asistencia %']];
    for (const emp of report.absence_list) {
      const tardyData = report.tardiness_ranking.find(t => t.employee_id === emp.id);
      detalleRows.push([
        emp.first_name,
        emp.last_name,
        emp.department || '',
        emp.days_present,
        emp.days_absent,
        tardyData?.late_count || 0,
        tardyData?.total_late_minutes || 0,
        tardyData?.early_count || 0,
        emp.attendance_rate,
      ]);
    }
    const wsDetalle = XLSX.utils.aoa_to_sheet(detalleRows);
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle Colaboradores');

    // Sheet 3: Asistencia por Día
    const diariaRows = [['Fecha', 'Día', 'Presentes', 'Total', 'Tasa %']];
    for (const d of report.daily_attendance) {
      const dayName = new Date(d.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long' });
      diariaRows.push([d.date, dayName, d.present, d.total, d.rate]);
    }
    const wsDiaria = XLSX.utils.aoa_to_sheet(diariaRows);
    XLSX.utils.book_append_sheet(wb, wsDiaria, 'Asistencia Diaria');

    // Sheet 4: Ranking Atrasos
    const atrasosRows = [['Pos.', 'Nombre', 'Departamento', 'Atrasos', 'Min. Total', 'Fechas Atraso']];
    report.tardiness_ranking.filter(e => e.late_count > 0).forEach((emp, i) => {
      atrasosRows.push([
        i + 1,
        `${emp.first_name} ${emp.last_name}`,
        emp.department || '',
        emp.late_count,
        emp.total_late_minutes,
        emp.dates_late.map(d => `${d.date} (${d.time}, +${d.minutes_late}min)`).join('; '),
      ]);
    });
    const wsAtrasos = XLSX.utils.aoa_to_sheet(atrasosRows);
    XLSX.utils.book_append_sheet(wb, wsAtrasos, 'Atrasos');

    // Sheet 5: Inasistencias
    const ausenciasRows = [['Nombre', 'Departamento', 'Días Ausente', 'Fechas Ausencia']];
    for (const emp of report.absence_list.filter(e => e.days_absent > 0)) {
      ausenciasRows.push([
        `${emp.first_name} ${emp.last_name}`,
        emp.department || '',
        emp.days_absent,
        emp.absent_dates.join(', '),
      ]);
    }
    const wsAusencias = XLSX.utils.aoa_to_sheet(ausenciasRows);
    XLSX.utils.book_append_sheet(wb, wsAusencias, 'Inasistencias');

    // Sheet 6: Por Día de Semana
    if (report.day_of_week) {
      const dowRows = [['Día', 'Asistencia Promedio %', 'Tasa de Atraso %', 'Total Ingresos', 'Llegadas Tarde']];
      for (const d of report.day_of_week) {
        dowRows.push([d.name, d.avg_attendance, d.late_rate, d.entries, d.late]);
      }
      const wsDow = XLSX.utils.aoa_to_sheet(dowRows);
      XLSX.utils.book_append_sheet(wb, wsDow, 'Por Día Semana');
    }

    // Sheet 7: Por Departamento
    if (report.department_breakdown) {
      const deptRows = [['Departamento', 'Colaboradores', 'Total Ingresos', 'Llegadas Tarde', 'Tasa Atraso %']];
      for (const d of report.department_breakdown) {
        deptRows.push([d.name, d.employees, d.total_entries, d.late, d.total_entries > 0 ? Math.round((d.late / d.total_entries) * 100) : 0]);
      }
      const wsDept = XLSX.utils.aoa_to_sheet(deptRows);
      XLSX.utils.book_append_sheet(wb, wsDept, 'Por Departamento');
    }

    XLSX.writeFile(wb, `Flexio-Reporte-${report.period}-${report.start_date}.xlsx`);
  }

  if (loading && !report) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <div className="flex items-center gap-3">
          {/* Period tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Export */}
          {report && tab !== 'today' && (
            <button
              onClick={exportExcel}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all"
            >
              <Download className="w-4 h-4" />
              Excel
            </button>
          )}
        </div>
      </div>

      {/* Period info */}
      {report && tab !== 'today' && (
        <p className="text-sm text-gray-500 mb-6">
          <Calendar className="w-4 h-4 inline mr-1" />
          {report.start_date} al {report.end_date} · {report.working_days} días hábiles · Horario: {report.schedule.entry_time} (+{report.schedule.tolerance_minutes} min tolerancia)
        </p>
      )}

      {/* KPI Cards */}
      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard icon={<Users className="w-5 h-5" />} label="Colaboradores" value={report.overview.total_employees} color="blue" />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Tasa Asistencia"
            value={`${report.overview.attendance_rate}%`}
            color={report.overview.attendance_rate >= 90 ? 'green' : report.overview.attendance_rate >= 70 ? 'orange' : 'red'}
          />
          <StatCard icon={<Timer className="w-5 h-5" />} label="Llegadas Tarde" value={report.overview.total_late} color="orange" />
          <StatCard icon={<Award className="w-5 h-5" />} label="Siempre Puntuales" value={report.overview.punctual_employees} color="green" />
        </div>
      )}

      {/* TODAY: Real-time view */}
      {tab === 'today' && todaySummary && (
        <>
          {/* Today stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <StatCard icon={<UserCheck className="w-5 h-5" />} label="Presentes" value={todaySummary.present_today} color="green" />
            <StatCard icon={<UserX className="w-5 h-5" />} label="Ausentes" value={todaySummary.absent} color="red" />
            <StatCard icon={<Clock className="w-5 h-5" />} label="Salieron" value={todaySummary.exited_today} color="orange" />
            <StatCard
              icon={<TrendingUp className="w-5 h-5" />}
              label="Tasa Hoy"
              value={`${todaySummary.total_employees > 0 ? Math.round((todaySummary.present_today / todaySummary.total_employees) * 100) : 0}%`}
              color="blue"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Absent today */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h3 className="font-bold text-gray-900">Ausentes Hoy</h3>
                {absentToday.length > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">{absentToday.length}</span>
                )}
              </div>
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {absentToday.map(emp => (
                  <div key={emp.id} className="flex items-center gap-3 p-2.5 bg-red-50/50 rounded-xl">
                    <Avatar name={`${emp.first_name} ${emp.last_name}`} photo={emp.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-400">{emp.department || '—'}</p>
                    </div>
                  </div>
                ))}
                {absentToday.length === 0 && (
                  <p className="text-center text-emerald-500 text-sm py-6">Todos presentes</p>
                )}
              </div>
            </div>

            {/* Last records */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-gray-400" />
                <h3 className="font-bold text-gray-900">Últimos Registros</h3>
              </div>
              <div className="space-y-2 max-h-[350px] overflow-y-auto">
                {todaySummary.last_records.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                    <Avatar name={`${r.first_name} ${r.last_name}`} photo={r.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{r.first_name} {r.last_name}</p>
                      <p className="text-xs text-gray-400">{new Date(r.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      r.type === 'entry' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {r.type === 'entry' ? 'Ingreso' : 'Salida'}
                    </span>
                  </div>
                ))}
                {todaySummary.last_records.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-6">Sin registros hoy</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* WEEK/MONTH: Detailed reports */}
      {tab !== 'today' && report && (
        <>
          {/* Attendance Trend Chart */}
          {report.daily_attendance.length > 0 && (
            <div className="card mb-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-primary-600" />
                <h3 className="font-bold text-gray-900">Tendencia de Asistencia</h3>
              </div>
              <div className="flex items-end gap-1 h-32">
                {report.daily_attendance.map((d, i) => {
                  const height = d.rate;
                  const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' });
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-500 font-medium">{d.rate}%</span>
                      <div className="w-full relative rounded-t-md overflow-hidden" style={{ height: `${Math.max(height, 4)}%` }}>
                        <div className={`absolute inset-0 rounded-t-md ${
                          d.rate >= 90 ? 'bg-emerald-500' : d.rate >= 70 ? 'bg-amber-400' : 'bg-red-400'
                        }`} />
                      </div>
                      <span className="text-[9px] text-gray-400 truncate w-full text-center">{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Day of Week Breakdown */}
            {report.day_of_week && (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-5 h-5 text-primary-600" />
                  <h3 className="font-bold text-gray-900">Asistencia por Día</h3>
                </div>
                <div className="space-y-2">
                  {report.day_of_week.map(d => (
                    <div key={d.name} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-20 shrink-0">{d.name}</span>
                      <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all ${
                            d.avg_attendance >= 90 ? 'bg-emerald-500' : d.avg_attendance >= 70 ? 'bg-amber-400' : 'bg-red-400'
                          }`}
                          style={{ width: `${d.avg_attendance}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                          {d.avg_attendance}%
                        </span>
                      </div>
                      {d.late > 0 && (
                        <span className="text-xs text-amber-600 shrink-0">{d.late} tarde</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Department Breakdown */}
            {report.department_breakdown && report.department_breakdown.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-primary-600" />
                  <h3 className="font-bold text-gray-900">Por Departamento</h3>
                </div>
                <div className="space-y-2">
                  {report.department_breakdown.map(dept => (
                    <div key={dept.name} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{dept.name}</p>
                        <p className="text-xs text-gray-400">{dept.employees} colaboradores</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-gray-900">{dept.total_entries} ingresos</p>
                        {dept.late > 0 && <p className="text-xs text-amber-600">{dept.late} atrasos</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Executive metrics */}
          {report.overview.avg_entry_time && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <StatCard icon={<Clock className="w-5 h-5" />} label="Hora Prom. Ingreso" value={report.overview.avg_entry_time} color="blue" />
              <StatCard icon={<UserX className="w-5 h-5" />} label="Días Ausencia Total" value={report.overview.total_absent_days} color="red" />
              <StatCard icon={<UserCheck className="w-5 h-5" />} label="Ingresos a Tiempo" value={report.overview.total_on_time} color="green" />
              <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Ingresos Totales" value={report.overview.total_entries} color="blue" />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Tardiness Ranking */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-gray-900">Ranking de Atrasos</h3>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {report.tardiness_ranking.filter(e => e.late_count > 0).map((emp, i) => (
                  <div key={emp.employee_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? 'bg-red-100 text-red-700' : i === 1 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {i + 1}
                    </span>
                    <Avatar name={`${emp.first_name} ${emp.last_name}`} photo={emp.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-400">{emp.department || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-amber-600">{emp.late_count} atrasos</p>
                      <p className="text-xs text-gray-400">{emp.total_late_minutes} min total</p>
                    </div>
                  </div>
                ))}
                {report.tardiness_ranking.filter(e => e.late_count > 0).length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-6">Sin atrasos en este período</p>
                )}
              </div>
            </div>

            {/* Punctuality Bonus */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-emerald-500" />
                <h3 className="font-bold text-gray-900">Bono de Puntualidad</h3>
                <span className="text-xs text-gray-400">(sin atrasos)</span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {report.punctuality_bonus.map((emp, i) => (
                  <div key={emp.employee_id} className="flex items-center gap-3 p-3 bg-emerald-50/50 rounded-xl">
                    <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <Avatar name={`${emp.first_name} ${emp.last_name}`} photo={emp.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{emp.first_name} {emp.last_name}</p>
                      <p className="text-xs text-gray-400">{emp.department || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-emerald-600">{emp.early_count} tempranos</p>
                      <p className="text-xs text-gray-400">{emp.total_entries} días</p>
                    </div>
                  </div>
                ))}
                {report.punctuality_bonus.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-6">Sin datos suficientes</p>
                )}
              </div>
            </div>
          </div>

          {/* Full Attendance Table */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-600" />
                <h3 className="font-bold text-gray-900">Detalle por Colaborador</h3>
              </div>
              <button
                onClick={exportExcel}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                <Download className="w-4 h-4" />
                Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="pb-3 font-semibold text-gray-600">Colaborador</th>
                    <th className="pb-3 font-semibold text-gray-600 text-center">Presentes</th>
                    <th className="pb-3 font-semibold text-gray-600 text-center">Ausentes</th>
                    <th className="pb-3 font-semibold text-gray-600 text-center">Atrasos</th>
                    <th className="pb-3 font-semibold text-gray-600 text-center">Asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {report.absence_list.map(emp => {
                    const tardyData = report.tardiness_ranking.find(t => t.employee_id === emp.id);
                    return (
                      <tr key={emp.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Avatar name={`${emp.first_name} ${emp.last_name}`} photo={emp.photo_url} size="xs" />
                            <div>
                              <p className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                              <p className="text-xs text-gray-400">{emp.department || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <span className="text-emerald-600 font-medium">{emp.days_present}</span>
                        </td>
                        <td className="py-3 text-center">
                          <span className={`font-medium ${emp.days_absent > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {emp.days_absent}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <span className={`font-medium ${tardyData?.late_count > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                            {tardyData?.late_count || 0}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                            emp.attendance_rate >= 90 ? 'bg-emerald-100 text-emerald-700' :
                            emp.attendance_rate >= 70 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {emp.attendance_rate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="card flex items-center gap-3 sm:gap-4">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-xl sm:text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs sm:text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

function Avatar({ name, photo, size = 'sm' }) {
  const sizeClass = size === 'xs' ? 'w-8 h-8' : 'w-9 h-9';
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs';
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className={`${sizeClass} rounded-full bg-gray-200 overflow-hidden shrink-0`}>
      {photo ? (
        <img src={photo} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full flex items-center justify-center text-gray-400 font-bold ${textSize}`}>
          {initials}
        </div>
      )}
    </div>
  );
}
