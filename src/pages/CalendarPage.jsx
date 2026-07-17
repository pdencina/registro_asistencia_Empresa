import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { attendanceApi, employeesApi } from '../api';

const STATUS_COLORS = {
  present: 'bg-emerald-500',
  late: 'bg-amber-400',
  absent: 'bg-red-400',
  leave: 'bg-blue-400',
  weekend: 'bg-gray-100',
  future: 'bg-gray-50',
};

const STATUS_LABELS = {
  present: 'Presente',
  late: 'Llegó tarde',
  absent: 'Ausente',
  leave: 'Permiso/Licencia',
};

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { loadCalendar(); }, [year, month, selectedEmployee]);

  async function loadEmployees() {
    try {
      const emps = await employeesApi.getAll({ active: '1' });
      setEmployees(emps);
    } catch (e) {}
  }

  async function loadCalendar() {
    setLoading(true);
    try {
      const params = { year, month };
      if (selectedEmployee) params.employee_id = selectedEmployee;
      const result = await attendanceApi.getCalendar(params);
      setData(result);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  function handleDayClick(emp, day) {
    if (day.status === 'weekend' || day.status === 'future') return;
    setDetail({
      name: `${emp.first_name} ${emp.last_name}`,
      department: emp.department,
      date: day.date,
      status: day.status,
      time: day.time,
      dayName: new Date(day.date + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
    });
  }

  // Calculate the starting day offset for the month grid
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Monday = 0

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
          <h2 className="text-2xl font-bold text-gray-900">Calendario de Asistencia</h2>
          <p className="text-sm text-gray-500 mt-1">Vista mensual por colaborador</p>
        </div>

        {/* Employee filter */}
        <select
          value={selectedEmployee}
          onChange={e => setSelectedEmployee(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">Todos los colaboradores</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
          ))}
        </select>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-6 bg-white rounded-xl border border-gray-200 p-3">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900 capitalize">{data?.month_name || ''} {year}</p>
          <p className="text-xs text-gray-400">Horario: {data?.schedule?.entry_time || '08:30'} (+{data?.schedule?.tolerance || 10} min)</p>
        </div>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-all">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 px-1">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-xs text-gray-600">Presente</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-400" /><span className="text-xs text-gray-600">Tarde</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-400" /><span className="text-xs text-gray-600">Ausente</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-400" /><span className="text-xs text-gray-600">Permiso/Licencia</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-gray-200" /><span className="text-xs text-gray-600">Fin de semana</span></div>
      </div>

      {/* Calendar grids per employee */}
      {data && data.employees.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay colaboradores registrados</p>
        </div>
      )}

      <div className="space-y-4">
        {data?.employees.map(emp => {
          // Stats for this employee
          const stats = { present: 0, late: 0, absent: 0, leave: 0 };
          emp.days.forEach(d => { if (stats[d.status] !== undefined) stats[d.status]++; });

          return (
            <div key={emp.employee_id} className="bg-white rounded-xl border border-gray-200 p-4">
              {/* Employee header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden shrink-0">
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
                  <p className="text-xs text-gray-400">{emp.department || '—'}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                  <span className="text-emerald-600 font-medium">{stats.present} ✓</span>
                  <span className="text-amber-600 font-medium">{stats.late} ⚠</span>
                  <span className="text-red-600 font-medium">{stats.absent} ✗</span>
                  {stats.leave > 0 && <span className="text-blue-600 font-medium">{stats.leave} 📋</span>}
                </div>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
                ))}
              </div>

              {/* Days grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: startOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}

                {/* Day cells */}
                {emp.days.map((day, i) => (
                  <div
                    key={day.date}
                    onClick={() => handleDayClick(emp, day)}
                    className={`aspect-square rounded-md flex flex-col items-center justify-center text-[10px] transition-all ${
                      day.status === 'weekend' ? 'bg-gray-50 text-gray-300' :
                      day.status === 'future' ? 'bg-gray-50/50 text-gray-300' :
                      `${STATUS_COLORS[day.status]} cursor-pointer hover:ring-2 hover:ring-primary-300 hover:scale-105`
                    } ${day.status === 'present' || day.status === 'late' || day.status === 'leave' ? 'text-white' : ''} ${day.status === 'absent' ? 'text-white' : ''}`}
                  >
                    <span className="font-bold">{i + 1}</span>
                    {day.time && <span className="text-[8px] opacity-80">{day.time}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center" onClick={e => e.stopPropagation()}>
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4 ${
              detail.status === 'present' ? 'bg-emerald-100 text-emerald-600' :
              detail.status === 'late' ? 'bg-amber-100 text-amber-600' :
              detail.status === 'absent' ? 'bg-red-100 text-red-600' :
              'bg-blue-100 text-blue-600'
            }`}>
              <Calendar className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">{detail.name}</h3>
            <p className="text-sm text-gray-500 mb-3">{detail.dayName}</p>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-2 ${
              detail.status === 'present' ? 'bg-emerald-100 text-emerald-700' :
              detail.status === 'late' ? 'bg-amber-100 text-amber-700' :
              detail.status === 'absent' ? 'bg-red-100 text-red-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {STATUS_LABELS[detail.status] || detail.status}
            </div>
            {detail.time && (
              <p className="text-sm text-gray-600 mt-1">Ingreso: {detail.time} hrs</p>
            )}
            <button onClick={() => setDetail(null)} className="mt-4 text-sm text-gray-400 hover:text-gray-600">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
