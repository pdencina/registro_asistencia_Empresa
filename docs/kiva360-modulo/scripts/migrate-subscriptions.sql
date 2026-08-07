-- ============================================================
-- Kiva360 — Schema: Propuestas + Contratos + Suscripciones
-- Ejecutar en PostgreSQL (Neon)
-- ============================================================

-- 1. PROPUESTAS
CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(30) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'draft', -- draft, sent, viewed, accepted, rejected, expired
  
  -- Cliente
  company_name VARCHAR(200) NOT NULL,
  company_rut VARCHAR(20),
  contact_name VARCHAR(200),
  contact_email VARCHAR(200),
  contact_phone VARCHAR(50),
  
  -- Plan
  plan VARCHAR(50) NOT NULL DEFAULT 'profesional', -- starter, profesional, enterprise
  num_students INTEGER NOT NULL DEFAULT 80,
  price_monthly INTEGER NOT NULL, -- precio neto mensual en CLP
  discount_percent INTEGER DEFAULT 0,
  setup_fee INTEGER DEFAULT 0,
  
  -- Términos
  trial_days INTEGER DEFAULT 15,
  min_contract_months INTEGER DEFAULT 0,
  cancellation_days INTEGER DEFAULT 15,
  notes TEXT,
  valid_until DATE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_ip VARCHAR(50)
);

-- 2. CONTRATOS
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id),
  
  -- Datos del cliente
  company_name VARCHAR(200) NOT NULL,
  company_rut VARCHAR(20),
  plan VARCHAR(50) NOT NULL,
  price_monthly INTEGER NOT NULL,
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, annual
  
  -- Firmante
  firmante_nombre VARCHAR(200),
  firmante_rut VARCHAR(20),
  firmante_email VARCHAR(200),
  firmante_cargo VARCHAR(100),
  
  -- Firma
  firma_digital TEXT, -- base64 de la firma dibujada
  firmado_at TIMESTAMPTZ,
  firma_hash VARCHAR(64),
  auditoria_firma JSONB,
  
  -- Estado
  estado VARCHAR(20) DEFAULT 'pendiente', -- pendiente, firmado_cliente, firmado, activo, cancelado
  fecha_inicio DATE,
  fecha_termino DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SUSCRIPCIONES
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id),
  
  -- Datos
  company_name VARCHAR(200) NOT NULL,
  company_rut VARCHAR(20),
  plan VARCHAR(50) NOT NULL,
  price_monthly INTEGER NOT NULL, -- neto CLP
  
  -- Estado
  status VARCHAR(20) DEFAULT 'active', -- active, past_due, grace_period, suspended, cancelled
  
  -- Fechas de ciclo
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  next_billing_date DATE NOT NULL,
  grace_until DATE, -- fecha límite de gracia (5 días post vencimiento)
  
  -- Tarjeta (si tiene cobro automático)
  card_registered BOOLEAN DEFAULT false,
  card_last_four VARCHAR(4),
  card_brand VARCHAR(20), -- visa, mastercard, amex
  card_token TEXT, -- token del procesador de pagos
  card_registered_at TIMESTAMPTZ,
  
  -- Config
  auto_charge BOOLEAN DEFAULT false,
  billing_day INTEGER DEFAULT 30, -- día del mes para cobrar
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. PAGOS (historial)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id),
  
  -- Monto
  amount INTEGER NOT NULL, -- neto CLP
  iva INTEGER NOT NULL, -- 19%
  total INTEGER NOT NULL, -- amount + iva
  
  -- Estado
  status VARCHAR(20) DEFAULT 'pending', -- pending, paid, failed, refunded
  method VARCHAR(30), -- transfer, card_auto, card_manual
  
  -- Período que cubre
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Pago
  paid_at TIMESTAMPTZ,
  payment_reference VARCHAR(100), -- referencia de la transacción
  failure_reason TEXT,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_proposals_reference ON proposals(reference);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_contracts_proposal ON contracts(proposal_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_contract ON subscriptions(contract_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON subscriptions(next_billing_date);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(period_start, period_end);
