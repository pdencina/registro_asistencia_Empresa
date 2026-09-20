-- Migración 002: política de marcación por empresa (versionada) y credenciales PIN con hash.
--
-- Aditiva: no toca employees.personal_pin (se migra con scripts/migrate-pins.js, en dos pasos).
-- Las restricciones que impone el texto de la Res. Ex. N.º 38 quedan como CHECK en la base:
--   * marks_retention_years >= 5            (Art. 53 f, 58 l)
--   * template_destroy_after_termination_days entre 90 y 120   (Art. 57.4)
--   * geo_mode solo OFF | EVIDENCE           (Art. 53 c: la geolocalización nunca bloquea)
--   * event_selection solo WORKER_CHOICE     (Art. 35-36, 41 d)
--
-- Cada sentencia se separa con una línea "-- @@" (ver api/lib/migrations.js).

CREATE TABLE IF NOT EXISTS tenant_attendance_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  version INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'UNCONFIGURED')),
  legacy_marking BOOLEAN NOT NULL DEFAULT true,
  primary_methods JSONB NOT NULL DEFAULT '["FACIAL"]'::jsonb,
  fallback_methods JSONB NOT NULL DEFAULT '["PIN"]'::jsonb,
  channel_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_selection VARCHAR(20) NOT NULL DEFAULT 'WORKER_CHOICE' CHECK (event_selection = 'WORKER_CHOICE'),
  facial_threshold NUMERIC(4, 3) NOT NULL DEFAULT 0.500 CHECK (facial_threshold BETWEEN 0.300 AND 0.700),
  pin_min_length SMALLINT NOT NULL DEFAULT 4 CHECK (pin_min_length BETWEEN 4 AND 8),
  pin_max_attempts SMALLINT NOT NULL DEFAULT 5 CHECK (pin_max_attempts BETWEEN 3 AND 10),
  pin_lockout_minutes SMALLINT NOT NULL DEFAULT 15 CHECK (pin_lockout_minutes BETWEEN 1 AND 1440),
  evidence_photo VARCHAR(20) NOT NULL DEFAULT 'ON_FAILURE' CHECK (evidence_photo IN ('NEVER', 'ON_FAILURE', 'ALWAYS')),
  evidence_retention_days INTEGER CHECK (evidence_retention_days IS NULL OR evidence_retention_days BETWEEN 1 AND 3650),
  template_destroy_after_termination_days SMALLINT NOT NULL DEFAULT 90
    CHECK (template_destroy_after_termination_days BETWEEN 90 AND 120),
  marks_retention_years SMALLINT NOT NULL DEFAULT 5 CHECK (marks_retention_years >= 5),
  geo_mode VARCHAR(20) NOT NULL DEFAULT 'EVIDENCE' CHECK (geo_mode IN ('OFF', 'EVIDENCE')),
  offline_policy JSONB NOT NULL DEFAULT '{"allowed": true, "max_age_hours": 168, "justification": null}'::jsonb,
  regulatory_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_reason TEXT,
  created_by VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_policy_tenant_version UNIQUE (tenant_id, version)
);
-- @@
-- Las versiones de política son históricas: no se editan ni se borran (la vigente es la de mayor versión).
CREATE OR REPLACE FUNCTION block_policy_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Las versiones de política de marcación son inmutables; cree una versión nueva.';
END;
$$ LANGUAGE plpgsql;
-- @@
DROP TRIGGER IF EXISTS trg_policy_immutable ON tenant_attendance_policy;
-- @@
CREATE TRIGGER trg_policy_immutable
  BEFORE UPDATE OR DELETE ON tenant_attendance_policy
  FOR EACH ROW EXECUTE FUNCTION block_policy_mutation();
-- @@
CREATE TABLE IF NOT EXISTS employee_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  type VARCHAR(10) NOT NULL DEFAULT 'PIN' CHECK (type IN ('PIN')),
  secret_hash TEXT NOT NULL,
  failed_count INTEGER NOT NULL DEFAULT 0,
  lock_count INTEGER NOT NULL DEFAULT 0,      -- bloqueos consecutivos: la duración crece (x2) hasta 24 h
  locked_until TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  set_by VARCHAR(20) NOT NULL DEFAULT 'WORKER' CHECK (set_by IN ('WORKER', 'MIGRATION')),
  CONSTRAINT uq_credential_employee_type UNIQUE (employee_id, type)
);
-- @@
CREATE INDEX IF NOT EXISTS idx_credentials_tenant ON employee_credentials (tenant_id);
-- @@
-- Registro de intentos de autenticación. NUNCA guarda el PIN ingresado ni datos biométricos.
CREATE TABLE IF NOT EXISTS auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  employee_id UUID,
  rut_hmac VARCHAR(64),
  method VARCHAR(20) NOT NULL,
  outcome VARCHAR(30) NOT NULL,
  reason VARCHAR(60),
  score NUMERIC,
  threshold NUMERIC,
  channel VARCHAR(20),
  device_id VARCHAR(100),
  ip VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- @@
CREATE INDEX IF NOT EXISTS idx_auth_attempts_tenant_time ON auth_attempts (tenant_id, created_at DESC);
-- @@
CREATE INDEX IF NOT EXISTS idx_auth_attempts_employee_time ON auth_attempts (employee_id, created_at DESC);
-- @@
-- Enlaces de un solo uso para que el propio trabajador cree su PIN (la administración nunca lo conoce).
CREATE TABLE IF NOT EXISTS credential_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  created_by VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
