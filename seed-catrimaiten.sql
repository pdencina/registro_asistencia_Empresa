-- ============================================================
-- SEED DEMO: Catrimaitén SpA — Fundo Catrimaitén (Loncoche, Villarrica)
-- Modelo agrícola: solo cosecha (packing se envía a Pi Berries)
-- Muestra representativa (~60 temporeros) con 1 semana de marcajes
-- Marcaje por RUT
-- Acceso: flexio.cl/admin/catrimaiten
-- ============================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_sch_cosecha UUID;
  v_emp_ids UUID[] := ARRAY[]::UUID[];
  v_emp_id UUID;
  v_date DATE;
  v_entry TIMESTAMP;
  v_exit TIMESTAMP;
  v_r FLOAT;
  i INT;
  v_nombres TEXT[] := ARRAY['Rodrigo','Isabel','Mario','Cecilia','Alberto','Verónica','Héctor','Mónica','Gonzalo','Silvia','Rubén','Alicia','Iván','Beatriz','Marco','Lucía','Fabián','Daniela','Camilo','Karina','Nelson','Ruth','Emilio','Marcela','Boris','Ximena','Álvaro','Roxana','Danilo','Yasna'];
  v_apellidos TEXT[] := ARRAY['Painemal','Coña','Huircán','Melín','Calfún','Ñancupil','Loncón','Traipe','Reñaco','Aillapán','Currín','Huaiquilaf','Panguilef','Marileo','Colipí','Namuncura','Quintún','Llaitul','Cariqueo','Antimán'];
BEGIN

-- Crear/obtener tenant Catrimaitén
SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'catrimaiten';
IF v_tenant_id IS NULL THEN
  INSERT INTO tenants (id, name, slug, rut_empresa, admin_email, admin_password, admin_pin_hash, plan, max_employees, max_devices, active, trial_ends_at)
  VALUES (gen_random_uuid(), 'Catrimaitén SpA', 'catrimaiten', '77.234.567-8', 'administracion@picapital.cl', 'catrimaiten2026', '1234', 'agricola', 5000, 50, true, NOW() + INTERVAL '15 days')
  RETURNING id INTO v_tenant_id;
END IF;

-- Limpiar
DELETE FROM attendance_records WHERE tenant_id = v_tenant_id;
DELETE FROM employee_schedules WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = v_tenant_id);
DELETE FROM employees WHERE tenant_id = v_tenant_id;

-- Horario cosecha
INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, lunch_break_minutes)
VALUES (gen_random_uuid(), 'Cosecha', '07:00', '16:00', 10, 45) RETURNING id INTO v_sch_cosecha;

-- 60 temporeros de cosecha
FOR i IN 1..60 LOOP
  INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, consent_status, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_tenant_id,
    v_nombres[1 + floor(random() * array_length(v_nombres,1))::int],
    v_apellidos[1 + floor(random() * array_length(v_apellidos,1))::int] || ' ' || v_apellidos[1 + floor(random() * array_length(v_apellidos,1))::int],
    (7 + floor(random()*13))::text || '.' || lpad(floor(random()*1000)::text,3,'0') || '.' || lpad(floor(random()*1000)::text,3,'0') || '-' || floor(random()*10)::text,
    'Cosecha', 'Temporero', 'approved', true, NOW(), NOW()
  );
END LOOP;

SELECT array_agg(id) INTO v_emp_ids FROM employees WHERE tenant_id = v_tenant_id;

-- Marcajes última semana (lun-sab)
FOR v_date IN SELECT generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval)::date
LOOP
  IF EXTRACT(DOW FROM v_date) = 0 THEN CONTINUE; END IF;

  FOREACH v_emp_id IN ARRAY v_emp_ids
  LOOP
    v_r := random();
    IF v_r < 0.90 THEN
      IF random() < 0.72 THEN
        v_entry := v_date + (interval '6 hours 50 minutes' + (random() * 20) * interval '1 minute');
      ELSE
        v_entry := v_date + (interval '7 hours 11 minutes' + (random() * 30) * interval '1 minute');
      END IF;

      INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
      VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'entry', v_entry, 'rut',
        'GPS: -39.3' || (10 + floor(random()*80))::text || ', -72.6' || (10 + floor(random()*80))::text || ' (Loncoche)');

      IF random() < 0.80 THEN
        v_exit := v_date + (interval '16 hours' + (random() * 60) * interval '1 minute');
      ELSE
        v_exit := v_date + (interval '17 hours' + (random() * 90) * interval '1 minute');
      END IF;

      INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
      VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'exit', v_exit, 'rut',
        'GPS: -39.3' || (10 + floor(random()*80))::text || ', -72.6' || (10 + floor(random()*80))::text || ' (Loncoche)');
    END IF;
  END LOOP;
END LOOP;

RAISE NOTICE 'Catrimaitén demo: % trabajadores, tenant: %', array_length(v_emp_ids,1), v_tenant_id;
END $$;
