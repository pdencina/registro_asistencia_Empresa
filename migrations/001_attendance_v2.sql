-- Migración 001: registro de asistencia v2 (aditiva)
--
-- NO modifica ni elimina filas existentes de attendance_records. Solo:
--   * agrega columnas de evidencia estructurada (autenticación, dispositivo, geolocalización, tiempos);
--   * agrega seq / hash_version para la cadena v2 (los registros históricos quedan en hash_version = 1);
--   * crea tenant_chain_heads (cabeza de cadena por empresa, permite anexar de forma atómica);
--   * convierte server_timestamp y created_at de TIMESTAMP a TIMESTAMPTZ (solo el tipo, no el instante);
--   * asegura audit_log con columnas de actor y contexto.
--
-- Cada sentencia se separa con una línea "-- @@" (ver api/lib/migrations.js).

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS record_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS timestamp_seal VARCHAR(64),
  ADD COLUMN IF NOT EXISTS server_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sequence_token VARCHAR(30),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS auth_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS auth_result VARCHAR(30),
  ADD COLUMN IF NOT EXISTS auth_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20),
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS location_id UUID,
  ADD COLUMN IF NOT EXISTS policy_version INTEGER,
  ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS server_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_offline_sync BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS geo_distance_m INTEGER,
  ADD COLUMN IF NOT EXISTS geo_accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS evidence_id UUID,
  ADD COLUMN IF NOT EXISTS evidence_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS seq BIGINT,
  ADD COLUMN IF NOT EXISTS hash_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS seal_key_id VARCHAR(16);
-- @@
-- Las columnas TIMESTAMP (sin zona) se guardaron en UTC. Se exige que la sesión esté en UTC
-- para que la conversión conserve el instante; si no, se aborta para revisión manual.
DO $$
DECLARE
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['server_timestamp', 'created_at'] LOOP
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'attendance_records' AND column_name = col)
       = 'timestamp without time zone' THEN
      IF current_setting('TimeZone') NOT IN ('UTC', 'Etc/UTC', 'GMT') THEN
        RAISE EXCEPTION 'TimeZone de la sesión es %, se esperaba UTC. Revisar antes de convertir %', current_setting('TimeZone'), col;
      END IF;
      EXECUTE format('ALTER TABLE attendance_records ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''', col, col);
    END IF;
  END LOOP;
END $$;
-- @@
CREATE TABLE IF NOT EXISTS tenant_chain_heads (
  tenant_id UUID PRIMARY KEY,
  last_seq BIGINT NOT NULL DEFAULT 0,
  last_hash VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- @@
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_tenant_seq
  ON attendance_records (tenant_id, seq) WHERE seq IS NOT NULL;
-- @@
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_hashver
  ON attendance_records (tenant_id, hash_version);
-- @@
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  actor VARCHAR(200),
  target_type VARCHAR(50),
  target_id UUID,
  details JSONB,
  ip VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
-- @@
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(30),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);
