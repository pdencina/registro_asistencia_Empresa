# Módulo: Propuesta + Contrato + Suscripciones — Kiva360

## Estructura

```
api/
├── proposals/
│   ├── index.js          # CRUD propuestas (admin crea, cliente ve)
│   └── [slug].js         # GET público por referencia
├── contracts/
│   ├── index.js          # Obtener/crear contrato para un cliente
│   └── sign.js           # Firma digital del cliente
├── subscriptions/
│   ├── index.js          # Portal del cliente: ver pagos, estado, próximo cobro
│   ├── register-card.js  # Registrar tarjeta para cobro automático
│   ├── charge.js         # Cron: cobra suscripciones el 30 de cada mes
│   └── webhook.js        # Webhook de procesador de pagos
└── lib/
    └── payments.js       # Configuración de pago (datos bancarios, etc.)

frontend/
├── pages/
│   ├── ProposalPage.jsx     # Vista pública de propuesta
│   ├── ContractPage.jsx     # Vista de contrato + firma
│   └── SubscriptionPage.jsx # Portal del cliente: pagos, tarjeta, historial
└── components/
    ├── SignaturePad.jsx      # Componente de firma digital
    └── PaymentInfo.jsx      # Muestra datos bancarios

scripts/
└── migrate-subscriptions.sql  # Schema de BD
```

## Flujo

1. Admin crea propuesta → genera link `kiva360.cl/propuesta/REF-XXXX`
2. Cliente ve propuesta → acepta → se redirige a contrato
3. Cliente firma contrato (firma digital + acepta términos)
4. En el contrato se muestran datos de pago (transferencia o tarjeta)
5. Cliente puede registrar tarjeta para cobro automático
6. Cada 30 del mes: sistema intenta cobrar. Si falla, espera 5 días (gracia)
7. Portal del cliente: ve historial de pagos, próximo vencimiento, estado

## Datos de Pago del Prestador

- **Razón Social:** Flexio Technologies Spa
- **RUT:** 78.479.402-4
- **Banco:** Bci
- **Tipo de Cuenta:** Cuenta corriente en pesos
- **N° Cuenta:** 68569265
- **Email:** pablo@flexio.cl
