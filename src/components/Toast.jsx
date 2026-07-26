import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

/**
 * Global Toast provider. Wrap your app with this.
 * Usage: const toast = useToast(); toast.success('Guardado');
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 5000),
    warning: (msg) => addToast(msg, 'warning', 4000),
    info: (msg) => addToast(msg, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast container - centered */}
      {toasts.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-[200] flex items-center justify-center p-4">
          <div className="space-y-3 pointer-events-auto">
            {toasts.map(t => (
              <ToastItem key={t.id} toast={t} onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />
            ))}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if not wrapped in provider
    return {
      success: (msg) => console.log('[Toast]', msg),
      error: (msg) => console.error('[Toast]', msg),
      warning: (msg) => console.warn('[Toast]', msg),
      info: (msg) => console.info('[Toast]', msg),
    };
  }
  return ctx;
}

function ToastItem({ toast, onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const config = {
    success: { icon: CheckCircle, bg: 'bg-white', border: 'border-emerald-200', iconColor: 'text-emerald-500', shadow: 'shadow-emerald-100' },
    error: { icon: XCircle, bg: 'bg-white', border: 'border-red-200', iconColor: 'text-red-500', shadow: 'shadow-red-100' },
    warning: { icon: AlertTriangle, bg: 'bg-white', border: 'border-amber-200', iconColor: 'text-amber-500', shadow: 'shadow-amber-100' },
    info: { icon: Info, bg: 'bg-white', border: 'border-blue-200', iconColor: 'text-blue-500', shadow: 'shadow-blue-100' },
  }[toast.type] || config.success;

  const Icon = config.icon;

  return (
    <div
      className={`flex items-center gap-3 px-5 py-4 rounded-2xl border ${config.bg} ${config.border} shadow-xl ${config.shadow} min-w-[280px] max-w-md transition-all duration-300 ${
        visible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
      }`}
    >
      <Icon className={`w-6 h-6 ${config.iconColor} shrink-0`} />
      <p className="text-sm font-medium text-gray-800 flex-1">{toast.message}</p>
      <button onClick={onClose} className="text-gray-300 hover:text-gray-500 shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
