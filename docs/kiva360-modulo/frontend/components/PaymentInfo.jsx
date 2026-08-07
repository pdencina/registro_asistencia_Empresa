/**
 * Componente que muestra datos bancarios para transferencia.
 * Se usa en: ContractPage y SubscriptionPage.
 */
export default function PaymentInfo({ data }) {
  if (!data) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
      <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wide mb-3">
        Datos para transferencia
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-blue-600 text-xs">Razón Social</p>
          <p className="font-semibold text-gray-900">{data.razon_social}</p>
        </div>
        <div>
          <p className="text-blue-600 text-xs">RUT</p>
          <p className="font-semibold text-gray-900">{data.rut}</p>
        </div>
        <div>
          <p className="text-blue-600 text-xs">Banco</p>
          <p className="font-semibold text-gray-900">{data.banco}</p>
        </div>
        <div>
          <p className="text-blue-600 text-xs">Tipo de Cuenta</p>
          <p className="font-semibold text-gray-900">{data.tipo_cuenta}</p>
        </div>
        <div>
          <p className="text-blue-600 text-xs">N° Cuenta</p>
          <p className="font-semibold text-gray-900 font-mono">{data.numero_cuenta}</p>
        </div>
        <div>
          <p className="text-blue-600 text-xs">Email</p>
          <p className="font-semibold text-gray-900">{data.email}</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-blue-700">
        Envía el comprobante a <strong>{data.email}</strong> para activar tu pago más rápido.
      </p>
    </div>
  );
}
