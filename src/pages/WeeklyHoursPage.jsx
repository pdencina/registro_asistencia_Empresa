import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { attendanceApi } from '../api';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function WeeklyHoursPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(getThisMonday());

  function getThisMonday() {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    return monday.toISOString().split('T')[0];
  }

  useEffect(() => { loadData(); }, [weekStart]);

  async function loadData() {
    setLoading(true);
    try {
      const result = await attendanceApi.getWeeklyHours({ week_start: weekStart });
      setData(result);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  function prevWeek() {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }

  function nextWeek() {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    setWeekStart(d.toISOString().split('T')[0]);
  }

  function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
  }

  if (loading && !data) {
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
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Jornada Semanal</h2>
          <p className="text-sm text-gray-500 mt-1">Control de horas acumuladas por colaborador</p>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between mb-6 bg-white rounded-xl border border-gray-200 p-3">
        <button onClick={prevWeek} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900">Semana del {new Date(weekStart + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}</p>
          <p className="text-xs text-gray-400">{data?.week_start} al {data?.week_end}</p>
        </div>
        <button onClick={nextWeek} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Alerts summary */}
      {data && (data.alerts.exceeded > 0 || data.alerts.warning > 0) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {data.alerts.exceeded > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-800 font-medium">{data.alerts.exceeded} excedieron su jornada</p>
            </div>
          )}
          {data.alerts.warning > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
              <Clock className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-800 font-medium">{data.alerts.warning} cerca del límite (90%+)</p>
            </div>
          )}
        </div>
      )}

      {/* Employee cards */}
      {data && data.employees.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay registros esta semana</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.employees.map(emp => {
          const barColor = emp.status === 'exceeded' ? 'bg-red-500' : emp.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-500';
          const barBg = emp.status === 'exceeded' ? 'bg-red-100' : emp.status === 'warning' ? 'bg-amber-100' : 'bg-gray-100';
          const cardBorder = emp.status === 'exceeded' ? 'border-red-200' : emp.status === 'warning' ? 'border-amber-200' : 'border-gray-200';

          return (
            <div key={emp.employee_id} className={`bg-white rounded-xl border ${cardBorder} p-4`}>
              {/* Header row */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0">
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xs">
                      {emp.first_name[0]}{emp.last_name[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{emp.first_name} {emp.last_name}</p>
                  <p className="text-xs text-gray-400">{emp.department || '—'} · {emp.schedule_name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-gray-900">{emp.total_hours}h{emp.total_mins > 0 ? ` ${emp.total_mins}m` : ''}</p>
                  {emp.weekly_hours_contract && (
                    <p className="text-xs text-gray-500">de {emp.weekly_hours_contract}h contratadas</p>
                  )}
                </div>
                {/* Status badge */}
                <div className="shrink-0">
                  {emp.status === 'exceeded' && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                      <AlertTriangle className="w-3 h-3" /> Excedida
                    </span>
                  )}
                  {emp.status === 'warning' && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                      <Clock className="w-3 h-3" /> {emp.percentage}%
                    </span>
                  )}
                  {emp.status === 'normal' && emp.percentage !== null && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                      <TrendingUp className="w-3 h-3" /> {emp.percentage}%
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {emp.weekly_hours_contract && (
                <div className="mb-3">
                  <div className={`w-full h-3 ${barBg} rounded-full overflow-hidden`}>
                    <div className={`h-full ${barColor} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(emp.percentage || 0, 100)}%` }} />
                  </div>
                </div>
              )}

              {/* Daily breakdown */}
              <div className="grid grid-cols-7 gap-1">
                {emp.daily.map((day, i) => (
                  <div key={day.date} className="text-center">
                    <p className="text-[10px] text-gray-400 mb-1">{DAY_NAMES[i]}</p>
                    <div className={`rounded-lg p-1.5 ${day.minutes > 0 ? 'bg-primary-50' : 'bg-gray-50'}`}>
                      <p className={`text-xs font-bold ${day.minutes > 0 ? 'text-primary-700' : 'text-gray-300'}`}>
                        {day.minutes > 0 ? formatMinutes(day.minutes) : '—'}
                      </p>
                      {day.entry && (
                        <p className="text-[9px] text-gray-400 mt-0.5">
                          {day.entry}{day.exit && day.exit !== 'en curso' && day.exit !== 'sin salida' ? ` → ${day.exit}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
