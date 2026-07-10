import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import KioskLayout from './layouts/KioskLayout';
import AdminLayout from './layouts/AdminLayout';
import AdminLoginPage from './pages/AdminLoginPage';
import LandingPage from './pages/LandingPage';
import LoginRedirectPage from './pages/LoginRedirectPage';
import NoTenantPage from './pages/NoTenantPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import DpaPage from './pages/legal/DpaPage';
import SuperAdminLoginPage from './pages/superadmin/SuperAdminLoginPage';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';

function App() {
  return (
    <Router>
      <Routes>
        {/* Landing page comercial */}
        <Route path="/" element={<LandingPage />} />

        {/* Login: buscar empresa por email */}
        <Route path="/login" element={<LoginRedirectPage />} />

        {/* App por tenant: flexio.cl/app/slug */}
        <Route path="/app/:tenant" element={<KioskLayout />} />

        {/* App sin slug: mostrar mensaje */}
        <Route path="/app" element={<NoTenantPage />} />

        {/* Admin por tenant: flexio.cl/admin/slug */}
        <Route path="/admin/:tenant/*" element={<ProtectedAdmin />} />

        {/* Admin sin slug: redirigir a login */}
        <Route path="/admin" element={<Navigate to="/login" replace />} />

        {/* Super Admin: gestión de empresas */}
        <Route path="/superadmin" element={<ProtectedSuperAdmin />} />

        {/* Páginas legales */}
        <Route path="/legal/terms" element={<TermsPage />} />
        <Route path="/legal/privacy" element={<PrivacyPage />} />
        <Route path="/legal/dpa" element={<DpaPage />} />
      </Routes>
    </Router>
  );
}

function ProtectedAdmin() {
  const [authenticated, setAuthenticated] = useState(
    sessionStorage.getItem('admin_auth') === 'true'
  );

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
