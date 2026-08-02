-- ============================================================
-- SEED DATA: Demo tenant for BHS presentation
-- Simulates a school with ~35 employees across 4 departments
-- 2 weeks of realistic attendance data with varied patterns
-- Run against: flexio.cl/admin/demo
-- ============================================================

-- First, get or create the demo tenant
DO $$
DECLARE
  v_tenant_id UUID;
  v_schedule_id UUID;
  v_emp_ids UUID[] := ARRAY[]::UUID[];
  v_emp_id UUID;
  v_date DATE;
  v_entry_time TIMESTAMP;
  v_exit_time TIMESTAMP;
  v_random FLOAT;
BEGIN

-- Get demo tenant (create if not exists)
SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'demo';
IF v_tenant_id IS NULL THEN
  INSERT INTO tenants (id, name, slug, admin_email, admin_password, plan, active)
  VALUES (gen_random_uuid(), 'Colegio Demo', 'demo', 'admin@demo.cl', 'demo1234', 'profesional', true)
  RETURNING id INTO v_tenant_id;
END IF;

-- Clean existing demo data
DELETE FROM attendance_records WHERE tenant_id = v_tenant_id;
DELETE FROM employee_schedules WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = v_tenant_id);
DELETE FROM employees WHERE tenant_id = v_tenant_id;

-- Create schedules (table doesn't have tenant_id)
INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, lunch_break_minutes)
VALUES (gen_random_uuid(), 'Docentes', '08:00', '16:00', 10, 45)
RETURNING id INTO v_schedule_id;

INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, lunch_break_minutes)
VALUES (gen_random_uuid(), 'Administrativos', '08:30', '17:30', 15, 60);

INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, lunch_break_minutes)
VALUES (gen_random_uuid(), 'Auxiliares', '07:00', '15:00', 5, 30);

-- Create 35 employees across departments
-- Docentes (15)
INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, email, consent_status, active)
VALUES
  (gen_random_uuid(), v_tenant_id, 'Carolina', 'Muñoz', '12.345.678-5', 'Docentes', 'Profesora Lenguaje', 'cmunoz@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Roberto', 'Fuentes', '13.456.789-0', 'Docentes', 'Profesor Matemáticas', 'rfuentes@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Andrea', 'Soto', '14.567.890-1', 'Docentes', 'Profesora Ciencias', 'asoto@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Valentina', 'Díaz', '15.678.901-2', 'Docentes', 'Profesora Historia', 'vdiaz@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Martín', 'López', '16.789.012-3', 'Docentes', 'Profesor Inglés', 'mlopez@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Francisca', 'Ramírez', '11.234.567-4', 'Docentes', 'Profesora Ed. Física', 'framirez@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Joaquín', 'Herrera', '10.345.678-5', 'Docentes', 'Profesor Arte', 'jherrera@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Catalina', 'Vargas', '9.456.789-6', 'Docentes', 'Profesora Música', 'cvargas@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Diego', 'Morales', '17.567.890-7', 'Docentes', 'Profesor Tecnología', 'dmorales@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Javiera', 'Torres', '18.678.901-8', 'Docentes', 'Profesora Básica 1°', 'jtorres@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Sebastián', 'Rojas', '19.789.012-9', 'Docentes', 'Profesor Básica 2°', 'srojas@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Constanza', 'Silva', '20.890.123-0', 'Docentes', 'Profesora Básica 3°', 'csilva@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Tomás', 'Contreras', '21.901.234-1', 'Docentes', 'Profesor Básica 4°', 'tcontreras@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Isidora', 'Espinoza', '22.012.345-2', 'Docentes', 'Profesora Religión', 'iespinoza@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Matías', 'Campos', '23.123.456-3', 'Docentes', 'Profesor Ed. Diferencial', 'mcampos@demo.cl', 'approved', true);

-- Administrativos (10)
INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, email, consent_status, active)
VALUES
  (gen_random_uuid(), v_tenant_id, 'Patricia', 'González', '8.234.567-7', 'Administración', 'Directora', 'pgonzalez@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Fernando', 'Álvarez', '9.345.678-8', 'Administración', 'Subdirector', 'falvarez@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'María José', 'Peña', '10.456.789-9', 'Administración', 'Secretaria Académica', 'mjpena@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Alejandro', 'Vega', '11.567.890-0', 'Administración', 'Jefe Finanzas', 'avega@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Claudia', 'Reyes', '12.678.901-1', 'Administración', 'Recepcionista', 'creyes@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Ricardo', 'Mendoza', '13.789.012-2', 'Administración', 'Contador', 'rmendoza@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Lorena', 'Castro', '14.890.123-3', 'Administración', 'RRHH', 'lcastro@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Nicolás', 'Bravo', '15.901.234-4', 'Administración', 'Coordinador Académico', 'nbravo@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Daniela', 'Parra', '16.012.345-5', 'Administración', 'Psicóloga', 'dparra@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Gabriel', 'Figueroa', '17.123.456-6', 'Administración', 'Inspector General', 'gfigueroa@demo.cl', 'approved', true);

-- Auxiliares (7)
INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, email, consent_status, active)
VALUES
  (gen_random_uuid(), v_tenant_id, 'José', 'Martínez', '7.234.567-8', 'Auxiliares', 'Jefe Mantención', 'jmartinez@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Rosa', 'Sepúlveda', '8.345.678-9', 'Auxiliares', 'Auxiliar Aseo', 'rsepulveda@demo.cl', 'rejected', true),
  (gen_random_uuid(), v_tenant_id, 'Pedro', 'Guzmán', '9.456.789-0', 'Auxiliares', 'Auxiliar Mantención', 'pguzman@demo.cl', 'rejected', true),
  (gen_random_uuid(), v_tenant_id, 'Carmen', 'Flores', '10.567.890-1', 'Auxiliares', 'Auxiliar Aseo', 'cflores@demo.cl', 'rejected', true),
  (gen_random_uuid(), v_tenant_id, 'Luis', 'Araya', '11.678.901-2', 'Auxiliares', 'Portero', 'laraya@demo.cl', 'rejected', true),
  (gen_random_uuid(), v_tenant_id, 'Teresa', 'Vergara', '12.789.012-3', 'Auxiliares', 'Auxiliar Cocina', 'tvergara@demo.cl', 'rejected', true),
  (gen_random_uuid(), v_tenant_id, 'Miguel', 'Cortés', '13.890.123-4', 'Auxiliares', 'Jardinero', 'mcortes@demo.cl', 'rejected', true);

-- Coordinación (3)
INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, email, consent_status, active)
VALUES
  (gen_random_uuid(), v_tenant_id, 'Soledad', 'Arriagada', '14.901.234-5', 'Coordinación', 'UTP', 'sarriagada@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Andrés', 'Valenzuela', '15.012.345-6', 'Coordinación', 'Coord. Convivencia', 'avalenzuela@demo.cl', 'approved', true),
  (gen_random_uuid(), v_tenant_id, 'Marcela', 'Tapia', '16.123.456-7', 'Coordinación', 'Coord. Extraescolar', 'mtapia@demo.cl', 'approved', true);

-- Get all employee IDs
SELECT array_agg(id) INTO v_emp_ids FROM employees WHERE tenant_id = v_tenant_id;

-- Generate 2 weeks of attendance data (Monday to Friday)
-- Starting 14 days ago
FOR v_date IN SELECT generate_series(CURRENT_DATE - 13, CURRENT_DATE, '1 day'::interval)::date
LOOP
  -- Skip weekends
  IF EXTRACT(DOW FROM v_date) IN (0, 6) THEN CONTINUE; END IF;

  -- For each employee
  FOREACH v_emp_id IN ARRAY v_emp_ids
  LOOP
    v_random := random();

    -- 88% chance of showing up
    IF v_random < 0.88 THEN
      -- Entry time: varies by pattern
      -- 70% on time (7:50-8:10), 18% slightly late (8:11-8:30), 12% very late (8:31-9:00)
      IF random() < 0.70 THEN
        v_entry_time := v_date + (interval '7 hours 50 minutes' + (random() * 20) * interval '1 minute');
      ELSIF random() < 0.85 THEN
        v_entry_time := v_date + (interval '8 hours 11 minutes' + (random() * 19) * interval '1 minute');
      ELSE
        v_entry_time := v_date + (interval '8 hours 31 minutes' + (random() * 29) * interval '1 minute');
      END IF;

      -- Insert entry
      INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
      VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'entry', v_entry_time, 'visual',
        'GPS: -33.4' || (10 + floor(random()*80))::text || ', -70.6' || (10 + floor(random()*80))::text);

      -- Exit time: 80% normal (15:30-16:30), 15% overtime (16:31-18:00), 5% early (14:00-15:29)
      IF random() < 0.80 THEN
        v_exit_time := v_date + (interval '15 hours 30 minutes' + (random() * 60) * interval '1 minute');
      ELSIF random() < 0.95 THEN
        v_exit_time := v_date + (interval '16 hours 31 minutes' + (random() * 89) * interval '1 minute');
      ELSE
        v_exit_time := v_date + (interval '14 hours' + (random() * 89) * interval '1 minute');
      END IF;

      -- Insert exit
      INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
      VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'exit', v_exit_time, 'visual',
        'GPS: -33.4' || (10 + floor(random()*80))::text || ', -70.6' || (10 + floor(random()*80))::text);

    END IF;
    -- 12% absent (no record)
  END LOOP;
END LOOP;

RAISE NOTICE 'Demo data created: % employees, tenant_id: %', array_length(v_emp_ids, 1), v_tenant_id;
END $$;
