import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useState, lazy, Suspense } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import InstallPrompt from './components/InstallPrompt';
import AdminLayout from './layouts/AdminLayout';
import AdminLoginPage from './pages/AdminLoginPage';
import LoginRedirectPage from './pages/LoginRedirectPage';

// Lazy-loaded pages with motion library (heavy)
const LandingPage = lazy(() => import('./pages/LandingPage'));
import NoTenantPage from './pages/NoTenantPage';
import PinCheckInPage from './pages/PinCheckInPage';
import UniversalCheckInPage from './pages/UniversalCheckInPage';
import ConsentPage from './pages/ConsentPage';
import MarcajePage from './pages/MarcajePage';

// Lazy-loaded heavy pages (face-api.js only loads when needed)
const MobileCheckInPage = lazy(() => import('./pages/MobileCheckInPage'));
import ContractPage from './pages/ContractPage';
import MyHoursPage from './pages/MyHoursPage';
import ProposalPage from './pages/ProposalPage';
import CotizadorPage from './pages/CotizadorPage';
import BlogIndexPage from './pages/blog/BlogIndexPage';
import BlogPostPage from './pages/blog/BlogPostPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import DpaPage from './pages/legal/DpaPage';
import SuperAdminLoginPage from './pages/superadmin/SuperAdminLoginPage';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import { hasAdminSession } from './utils/adminSession';

function LoadingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    </div>
  );
}

// Redirige rutas de marcaje antiguas a las 2 rutas oficiales (conserva el slug)
function RedirectMarcaje({ to }) {
  const { tenant } = useParams();
  return <Navigate to={`/${to}/${tenant}`} replace />;
}

function App() {
  return (
    <ErrorBoundary>
    <ToastProvider>
    <Router>
      <InstallPrompt />
      <Routes>
        {/* Landing page comercial */}
        <Route path="/" element={<Suspense fallback={<LoadingPage />}><LandingPage /></Suspense>} />

        {/* Login: buscar empresa por email */}
        <Route path="/login" element={<LoginRedirectPage />} />

        {/* ===== MARCAJE — 2 RUTAS OFICIALES ===== */}

        {/* 1. Tótem fijo (tablet en la entrada): flexio.cl/marcaje/slug */}
        <Route path="/marcaje/:tenant" element={<MarcajePage />} />

        {/* 2. Marcaje móvil (celular del trabajador, terreno): flexio.cl/movil/slug */}
        <Route path="/movil/:tenant" element={<Suspense fallback={<LoadingPage />}><MobileCheckInPage /></Suspense>} />

        {/* --- Redirects de rutas antiguas (compatibilidad) --- */}
        <Route path="/app/:tenant" element={<RedirectMarcaje to="marcaje" />} />
        <Route path="/pin/:tenant" element={<RedirectMarcaje to="marcaje" />} />
        <Route path="/simple/:tenant" element={<RedirectMarcaje to="marcaje" />} />
        <Route path="/marcar/:tenant" element={<RedirectMarcaje to="movil" />} />

        {/* Acceso universal: flexio.cl/mi */}
        <Route path="/mi" element={<UniversalCheckInPage />} />

        {/* Mis horas: flexio.cl/mis-horas */}
        <Route path="/mis-horas" element={<MyHoursPage />} />

        {/* Contrato digital: flexio.cl/contrato/slug */}
        <Route path="/contrato/:tenant" element={<ContractPage />} />

        {/* Blog: flexio.cl/blog */}
        <Route path="/blog" element={<BlogIndexPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />

        {/* Cotizador público interactivo: flexio.cl/propuesta */}
        <Route path="/propuesta" element={<CotizadorPage />} />

        {/* Propuesta comercial personalizada: flexio.cl/propuesta/slug */}
        <Route path="/propuesta/:slug" element={<ProposalPage />} />

        {/* Consentimiento biométrico: flexio.cl/consentimiento/token */}
        <Route path="/consentimiento/:token" element={<ConsentPage />} />

        {/* App sin slug: mostrar mensaje */}
        <Route path="/app" element={<NoTenantPage />} />

        {/* Admin por tenant: flexio.cl/admin/slug */}
        <Route path="/admin/:tenant/*" element={<ProtectedAdmin />} />

        {/* Admin sin slug: siempre redirigir a login */}
        <Route path="/admin" element={<Navigate to="/login" replace />} />
        <Route path="/admin/" element={<Navigate to="/login" replace />} />
        <Route path="/admin/employees" element={<Navigate to="/login" replace />} />
        <Route path="/admin/attendance" element={<Navigate to="/login" replace />} />
        <Route path="/admin/settings" element={<Navigate to="/login" replace />} />

        {/* Super Admin: gestión de empresas */}
        <Route path="/superadmin" element={<ProtectedSuperAdmin />} />

        {/* Páginas legales */}
        <Route path="/legal/terms" element={<TermsPage />} />
        <Route path="/legal/privacy" element={<PrivacyPage />} />
        <Route path="/legal/dpa" element={<DpaPage />} />
      </Routes>
    </Router>
    </ToastProvider>
    </ErrorBoundary>
  );
}

function ProtectedAdmin() {
  const { tenant } = useParams();
  // La sesión debe tener token firmado y ser de la empresa que indica la URL
  const [authenticated, setAuthenticated] = useState(() => hasAdminSession(tenant));

  // Si no hay slug de tenant en la URL, redirigir a login
  if (!tenant) {
    return <Navigate to="/login" replace />;
  }

  if (!authenticated) {
    return <AdminLoginPage onLogin={() => setAuthenticated(true)} />;
  }

  return <AdminLayout />;
}

function ProtectedSuperAdmin() {
  const [authenticated, setAuthenticated] = useState(
    !!sessionStorage.getItem('superadmin_token')
  );

  if (!authenticated) {
    return <SuperAdminLoginPage onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <SuperAdminDashboard
      onLogout={() => {
        sessionStorage.removeItem('superadmin_token');
        setAuthenticated(false);
      }}
    />
  );
}

export default App;
