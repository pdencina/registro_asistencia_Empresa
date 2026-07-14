import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Users, ClipboardList, BarChart3, LogOut, Camera, Settings, Clock } from 'lucide-react';
import EmployeesPage from '../pages/EmployeesPage';
import AttendancePage from '../pages/AttendancePage';
import DashboardPage from '../pages/DashboardPage';
import CheckInPage from '../pages/CheckInPage';
import SettingsPage from '../pages/SettingsPage';
import SchedulesPage from '../pages/SchedulesPage';
import OvertimePage from '../pages/OvertimePage';

export default function AdminLayout() {
  const [time, setTime] = useState(new Date());
  const [tenantLogo, setTenantLogo] = useState(null);
  const navigate = useNavigate();
  const { tenant } = useParams();
  const basePath = tenant ? `/admin/${tenant}` : '/admin';

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Cargar logo del tenant
  useEffect(() => {
    async function loadLogo() {
      try {
        const res = await fetch('/api/settings/logo', {
          headers: tenant ? { 'x-tenant-slug': tenant } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.logo_url) setTenantLogo(data.logo_url);
        }
      } catch (e) {}
    }
    loadLogo();
  }, [tenant]);

  function handleLogout() {
    sessionStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_tenant');
    sessionStorage.removeItem('admin_email');
    navigate('/');
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {tenantLogo ? (
            <img src={tenantLogo} alt="Logo empresa" className="h-10 max-w-[160px] object-contain" />
          ) : (
            <img src="/logo-flexio.svg" alt="Flexio" className="h-8" />
          )}
          <div className="border-l border-gray-200 pl-3">
            <p className="text-xs text-gray-500">Panel Administrador</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">
              {time.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-2xl font-bold text-primary-600">
              {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
          <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Cerrar sesión">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/register" element={<CheckInPage />} />
          <Route path="/register" element={<CheckInPage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
          <Route path="/overtime" element={<OvertimePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to={basePath} replace />} />
        </Routes>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-gray-200 px-4 py-2">
        <div className="flex justify-around max-w-3xl mx-auto">
          <NavItem to={basePath} icon={<BarChart3 className="w-6 h-6" />} label="Dashboard" end />
          <NavItem to={`${basePath}/employees`} icon={<Users className="w-6 h-6" />} label="Colaboradores" />
          <NavItem to={`${basePath}/attendance`} icon={<ClipboardList className="w-6 h-6" />} label="Asistencia" />
          <NavItem to={`${basePath}/register`} icon={<Camera className="w-6 h-6" />} label="Registrar" />
          <NavItem to={`${basePath}/schedules`} icon={<Clock className="w-6 h-6" />} label="Horarios" />
          <NavItem to={`${basePath}/overtime`} icon={<Clock className="w-6 h-6" />} label="Hrs Extra" />
          <NavItem to={`${basePath}/settings`} icon={<Settings className="w-6 h-6" />} label="Config" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
          isActive
            ? 'text-primary-600 bg-primary-50'
            : 'text-gray-400 hover:text-gray-600'
        }`
      }
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </NavLink>
  );
}
