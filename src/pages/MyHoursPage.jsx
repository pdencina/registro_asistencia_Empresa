import { useState } from 'react';
import { Clock, User } from 'lucide-react';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default function MyHoursPage() {
  const [rut, setRut] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setData(null);

    try {
      const res = await fetch(`/api/attendance/my-hours?rut=${encodeURIComponent(rut)}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        const err = await res.json();
        setError(err.error || 'RUT no encontrado');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  function formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-7 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900">Mis Horas</h1>
          <p className="text-sm text-gray-500 mt-1">Consulta tu acumulado semanal</p>
        </div>

        {/* RUT input */}
        {!data && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ingresa tu RUT</label>
                <input
                  type="text"
                  value={rut}
                  onChange={e => setRut(formatRut(e.target.value))}
                  placeholder="12.345.678-9"
                  required
                  autoFocus
                  inputMode="numeric"
                  className="w-full px-4 py-4 border border-gray-200 rounded-xl text-center text-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              {error && <p className="text-sm text-red-600 text-center">{error}</p>}
              <button
                type="submit"
                disabled={loading || rut.length < 8}
                className="w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50"
              >
                {loading ? 'Consultando...' : 'Ver mis horas'}
              </button>
            </form>
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="space-y-4">
            {/* Employee info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 text-center">
              {data.tenant.logo_url && (
                <img src={data.tenant.logo_url} alt="" className="h-10 mx-auto mb-3 object-contain" />
              )}
              <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-3">
                <User className="w-7 h-7 text-primary-600" />
              </div>
              <p className="font-bold text-gray-900 text-lg">{data.employee.first_name} {data.employee.last_name}</p>
              <p className="text-sm text-gray-500">{data.employee.department || data.tenant.name}</p>
              <p className="text-xs text-gray-400 mt-1">{data.schedule.name}</p>
            </div>

            {/* Hours summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
              <div className="text-center mb-4">
                <p className="text-3xl font-bold text-gray-900">{data.total_hours}h {data.total_mins > 0 ? `${data.total_mins}m` : ''}</p>
                {data.schedule.weekly_hours && (
                  <p className="text-sm text-gray-500 mt-1">de {data.schedule.weekly_hours}h contratadas</p>
                )}
              </div>

              {/* Progress bar */}
              {data.percentage !== null && (
                <div className="mb-4">
                  <div className={`w-full h-4 rounded-full overflow-hidden ${data.percentage >= 100 ? 'bg-red-100' : data.percentage >= 90 ? 'bg-amber-100' : 'bg-gray-100'}`}>
                    <div
                      className={`h-full rounded-full transition-all ${data.percentage >= 100 ? 'bg-red-500' : data.percentage >= 90 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(data.percentage, 100)}%` }}
                    />
                  </div>
                  <p className="text-center text-sm font-medium text-gray-600 mt-2">{data.percentage}% de tu jornada semanal</p>
                </div>
              )}

              {/* Daily breakdown */}
              <div className="grid grid-cols-7 gap-1 mt-4">
                {data.daily.map((day, i) => (
                  <div key={day.date} className="text-center">
                    <p className="text-[10px] text-gray-400 mb-1">{DAY_NAMES[i]}</p>
                    <div className={`rounded-lg p-2 ${day.minutes > 0 ? 'bg-primary-50' : 'bg-gray-50'}`}>
                      <p className={`text-xs font-bold ${day.minutes > 0 ? 'text-primary-700' : 'text-gray-300'}`}>
                        {day.minutes > 0 ? formatMinutes(day.minutes) : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 text-center mt-4">
                Semana {data.week.start} al {data.week.end}
              </p>
            </div>

            {/* Back button */}
            <button
              onClick={() => { setData(null); setRut(''); }}
              className="w-full py-3 text-sm text-gray-500 hover:text-gray-700"
            >
              ← Consultar otro RUT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
