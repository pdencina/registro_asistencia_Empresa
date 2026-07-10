import { Building2 } from 'lucide-react';

export default function NoTenantPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8 text-yellow-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">URL incompleta</h2>
        <p className="text-sm text-gray-500 mb-6">
          Para acceder al sistema de asistencia necesitas la URL completa de tu empresa.
        </p>
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-400 mb-1">Formato correcto:</p>
          <p className="text-sm font-mono text-primary-600 font-medium">flexio.cl/app/<span className="text-gray-400">tu-empresa</span></p>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Si no tienes esta información, consulta con el administrador de tu empresa.
        </p>
        <div className="space-y-2">
          <a href="/login" className="block w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all text-center text-sm">
            Soy administrador
          </a>
          <a href="/" className="block w-full py-2 text-sm text-gray-400 hover:text-gray-600 text-center">
            Volver al inicio
          </a>
        </div>
      </div>
    </div>
  );
}
