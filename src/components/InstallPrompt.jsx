import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

/**
 * PWA Install Prompt banner.
 * Shows on mobile when the browser fires the beforeinstallprompt event (Android).
 * On iOS, shows a manual instruction banner.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [dismissed, setDismissed] = useState(
    localStorage.getItem('flexio_install_dismissed') === 'true'
  );

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone === true) return; // iOS standalone

    // Don't show if dismissed recently
    if (dismissed) return;

    // Detect iOS
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    setIsIOS(isiOS);

    if (isiOS) {
      // Show iOS banner after 5 seconds
      const timer = setTimeout(() => setShowBanner(true), 5000);
      return () => clearTimeout(timer);
    }

    // Android/Chrome: Listen for install prompt
    function handleBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, [dismissed]);

  function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') {
          setShowBanner(false);
        }
        setDeferredPrompt(null);
      });
    }
  }

  function handleDismiss() {
    setShowBanner(false);
    setDismissed(true);
    localStorage.setItem('flexio_install_dismissed', 'true');
  }

  if (!showBanner) return null;

  // iOS instructions
  if (isIOS) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-area-bottom">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 max-w-md mx-auto">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">Instala Flexio en tu iPhone</p>
              <p className="text-xs text-gray-500 mt-1">
                Toca <span className="inline-flex items-center"><svg className="w-4 h-4 inline text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></span> y luego <strong>"Agregar a pantalla de inicio"</strong>
              </p>
            </div>
            <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Android/Chrome install button
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-area-bottom">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 max-w-md mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm">Instala Flexio</p>
            <p className="text-xs text-gray-500">Acceso rápido desde tu pantalla de inicio</p>
          </div>
          <button
            onClick={handleInstall}
            className="bg-emerald-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-emerald-700 transition shrink-0"
          >
            Instalar
          </button>
          <button onClick={handleDismiss} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
