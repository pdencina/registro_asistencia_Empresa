import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import KioskLayout from './layouts/KioskLayout';
import AdminLayout from './layouts/AdminLayout';
import AdminLoginPage from './pages/AdminLoginPage';
import LandingPage from './pages/LandingPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';
import DpaPage from './pages/legal/DpaPage';

function App() {
  return (
    <Router>
      <Routes>
        {/* Landing page comercial */}
        <Route path="/" element={<LandingPage />} />

        {/* App: kiosko de registro facial */}
        <Route path="/app" element={<KioskLayout />} />

        {/* Admin: protegido con PIN */}
        <Route path="/admin/*" element={<ProtectedAdmin />} />

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

export default App;
