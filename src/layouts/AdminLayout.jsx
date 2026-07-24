import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Users, ClipboardList, BarChart3, LogOut, Camera, Settings, Clock, FileText,
  FileCheck, Palmtree, Calendar, AlertTriangle, Menu, X, Timer, ChevronDown
} from 'lucide-react';
import EmployeesPage from '../pages/EmployeesPage';
import AttendancePage from '../pages/AttendancePage';
import DashboardPage from '../pages/DashboardPage';
import CheckInPage from '../pages/CheckInPage';
import SettingsPage from '../pages/SettingsPage';
import SchedulesPage from '../pages/SchedulesPage';
import OvertimePage from '../pages/OvertimePage';
import MedicalLeavesPage from '../pages/MedicalLeavesPage';
import LeaveRequestsPage from '../pages/LeaveRequestsPage';
import CalendarPage from '../pages/CalendarPage';
import WeeklyHoursPage from '../pages/WeeklyHoursPage';
import WarningsPage from '../pages/WarningsPage';
import JustificationsPage from '../pages/JustificationsPage';
import OnboardingWizard from '../components/OnboardingWizard';

export default function AdminLayout() {
  const [time, setTime] = useState(new Date());
  const [tenantLogo, setTenantLogo] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { tenant } = useParams();
  const basePath = tenant ? `/admin/${tenant}` : '/admin';
  const role = sessionStorage.getItem('admin_role') || 'admin';

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

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

  useEffect(() => {
    const done = sessionStorage.getItem('onboarding_done');
    if (!done) {
      fetch('/api/employees?active=1', { headers: tenant ? { 'x-tenant-slug': tenant } : {} })
        .then(r => r.json())
        .then(data => { if (data.length === 0) setShowOnboarding(true); })
        .catch(() => {});
    }
  }, [tenant]);

  function handleLogout() {
    sessionStorage.removeItem('admin_auth');
    sessionStorage.removeItem('admin_tenant');
    sessionStorage.removeItem('admin_email');
    navigate('/');
  }

  const navSections = [
    {
      title: 'Principal',
      items: [
        { to: basePath, icon: BarChart3, label: 'Dashboard', end: true },
        { to: `${basePath}/employees`, icon: Users, label: 'Colaboradores' },
        { to: `${basePath}/attendance`, icon: ClipboardList, label: 'Asistencia' },
        { to: `${basePath}/register`, icon: Camera, label: 'Registrar Marcaje' },
      ],
    },
    {
      title: 'Jornada',
      items: [
        { to: `${basePath}/schedules`, icon: Clock, label: 'Horarios', hide: role === 'supervisor' },
        { to: `${basePath}/overtime`, icon: Timer, label: 'Horas Extra', hide: role === 'supervisor' },
        { to: `${basePath}/weekly-hours`, icon: Clock, label: 'Control Jornada' },
        { to: `${basePath}/calendar`, icon: Calendar, label: 'Calendario' },
      ],
    },
    {
      title: 'Permisos y Licencias',
      items: [
        { to: `${basePath}/leave-requests`, icon: Palmtree, label: 'Vacaciones / Permisos' },
        { to: `${basePath}/medical-leaves`, icon: FileText, label: 'Licencias Médicas', hide: role === 'supervisor' },
        { to: `${basePath}/justifications`, icon: FileCheck, label: 'Justificativos', hide: role === 'supervisor' },
      ],
    },
    {
      title: 'Disciplina',
      items: [
        { to: `${basePath}/warnings`, icon: AlertTriangle, label: 'Amonestaciones', hide: role === 'supervisor' },
      ],
    },
    {
      title: 'Configuración',
      items: [
        { to: `${basePath}/settings`, icon: Settings, label: 'Ajustes', hide: role !== 'admin' },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Onboarding Wizard */}
      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => setShowOnboarding(false)}
          basePath={basePath}
        />
      )}

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {tenantLogo ? (
              <img src={tenantLogo} alt="" className="h-8 max-w-[120px] object-contain" />
            ) : (
              <img src="/logo-flexio.svg" alt="Flexio" className="h-7" />
            )}
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navSections.map(section => {
            const visibleItems = section.items.filter(item => !item.hide);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.title}>
                <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">{section.title}</p>
                <div className="space-y-0.5">
                  {visibleItems.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 border-l-[3px] border-primary-600 ml-[-1px]'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`
                      }
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-gray-700">
                {time.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xl font-bold text-primary-600 tabular-nums">
              {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/register" element={<CheckInPage />} />
            <Route path="/schedules" element={<SchedulesPage />} />
            <Route path="/overtime" element={<OvertimePage />} />
            <Route path="/medical-leaves" element={<MedicalLeavesPage />} />
            <Route path="/leave-requests" element={<LeaveRequestsPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/weekly-hours" element={<WeeklyHoursPage />} />
            <Route path="/warnings" element={<WarningsPage />} />
            <Route path="/justifications" element={<JustificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to={basePath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
