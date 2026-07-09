import { useState, useEffect } from 'react';
import { Users, UserCheck, UserX, LogOut, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { attendanceApi, employeesApi } from '../api';

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [absentEmployees, setAbsentEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [summaryData, allEmployees, todayRecords] = await Promise.all([
        attendanceApi.getSummary(),
        employeesApi.getAll({ active: '1' }),
        attendanceApi.getToday(),
      ]);

      setSummary(summaryData);

      // Find employees who haven't checked in today
      const presentIds = new Set(todayRecords.map(r => r.employee_id));
      const absent = allEmployees.filter(e => !presentIds.has(e.id));
      setAbsentEmployees(absent);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!summary) return null;

  const attendanceRate = summary.total_employees > 0
    ? Math.round((summary.present_today / summary.total_employees) * 100) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard · Resumen del Día</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Users className="w-6 h-6" />} label="Total Colaboradores" value={summary.total_employees} color="blue" />
        <StatCard icon={<UserCheck className="w-6 h-6" />} label="Presentes Hoy" value={summary.present_today} color="green" />
        <StatCard icon={<LogOut className="w-6 h-6" />} label="Salieron" value={summary.exited_today} color="orange" />
        <StatCard icon={<UserX className="w-6 h-6" />} label="Ausentes" value={summary.absent} color="red" />
      </div>

      {/* Attendance rate */}
      <div className="card mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-5 h-5 text-primary-600" />
            <h3 className="font-bold text-gray-900">Tasa de Asistencia</h3>
          </div>
          <span className="text-3xl font-bold text-primary-600">{attendanceRate}%</span>
        </div>
        <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary-500 to-emerald-500 rounded-full transition-all duration-1000"
            style={{ width: `${attendanceRate}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Absent employees */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <h3 className="font-bold text-gray-900">Ausentes Hoy</h3>
            {absentEmployees.length > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {absentEmployees.length}
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {absentEmployees.map(emp => (
              <div key={emp.id} className="flex items-center gap-3 p-3 bg-red-50/50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden shrink-0">
                  {emp.photo_url ? (
                    <img src={emp.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xs">
                      {emp.first_name?.[0]}{emp.last_name?.[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{emp.first_name} {emp.last_name}</p>
                  <p className="text-xs text-gray-400">{emp.department || 'Sin área'}</p>
                </div>
                <span className="text-xs text-red-500 font-medium">Sin registro</span>
              </div>
            ))}
            {absentEmployees.length === 0 && (
              <div className="text-center py-6">
                <UserCheck className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Todos presentes hoy 🎉</p>
              </div>
            )}
          </div>
        </div>

        {/* Last records */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <Clock className="w-5 h-5 text-gray-400" />
            <h3 className="font-bold text-gray-900">Últimos Registros</h3>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {summary.last_records.map(record => (
              <div key={record.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="w-9 h-9 rounded-full bg-gray-200 overflow-hidden shrink-0">
                  {record.photo_url ? (
                    <img src={record.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xs">
                      {record.first_name?.[0]}{record.last_name?.[0]}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{record.first_name} {record.last_name}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(record.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  record.type === 'entry' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {record.type === 'entry' ? 'Ingreso' : 'Salida'}
                </span>
              </div>
            ))}
            {summary.last_records.length === 0 && (
              <p className="text-center text-gray-400 py-6 text-sm">Sin registros hoy</p>
            )}
          </div>
        </div>
      </div>
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
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}
