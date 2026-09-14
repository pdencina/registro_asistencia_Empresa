-- ============================================================
-- SEED DEMO: Pi Berries SpA — Fundo Las Tres Marías (Mafil, Valdivia)
-- Modelo agrícola: temporeros de cosecha + packing
-- Muestra representativa (~60 trabajadores) con 1 semana de marcajes
-- Marcaje por RUT (típico agrícola)
-- Acceso: flexio.cl/admin/pi-berries
-- ============================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_sch_cosecha UUID;
  v_sch_packing UUID;
  v_emp_ids UUID[] := ARRAY[]::UUID[];
  v_emp_id UUID;
  v_date DATE;
  v_entry TIMESTAMP;
  v_exit TIMESTAMP;
  v_r FLOAT;
  i INT;
  v_nombres TEXT[] := ARRAY['José','María','Luis','Rosa','Pedro','Carmen','Juan','Ana','Carlos','Marta','Miguel','Elena','Francisco','Sofía','Manuel','Laura','Jorge','Patricia','Sergio','Gloria','Raúl','Teresa','Víctor','Sara','Óscar','Julia','Andrés','Nancy','Cristián','Paola'];
  v_apellidos TEXT[] := ARRAY['Huenchún','Millán','Catrileo','Paillao','Curín','Nahuel','Antileo','Colil','Marilef','Quidel','Llanca','Painé','Cayún','Huaiquín','Neculmán','Trafipán','Manquel','Lemún','Curihual','Ñanco'];
BEGIN

-- Crear/obtener tenant Pi Berries
SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'pi-berries';
IF v_tenant_id IS NULL THEN
  INSERT INTO tenants (id, name, slug, rut_empresa, admin_email, admin_password, admin_pin_hash, plan, max_employees, max_devices, active, trial_ends_at)
  VALUES (gen_random_uuid(), 'Pi Berries SpA', 'pi-berries', '77.123.456-7', 'administracion@picapital.cl', 'piberries2026', '1234', 'agricola', 5000, 50, true, NOW() + INTERVAL '15 days')
  RETURNING id INTO v_tenant_id;
END IF;

-- Limpiar data previa
DELETE FROM attendance_records WHERE tenant_id = v_tenant_id;
DELETE FROM employee_schedules WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = v_tenant_id);
DELETE FROM employees WHERE tenant_id = v_tenant_id;

-- Horarios
INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, lunch_break_minutes)
VALUES (gen_random_uuid(), 'Cosecha', '07:00', '16:00', 10, 45) RETURNING id INTO v_sch_cosecha;
INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, lunch_break_minutes)
VALUES (gen_random_uuid(), 'Packing', '08:00', '18:00', 10, 60) RETURNING id INTO v_sch_packing;

-- Generar 50 temporeros de cosecha
FOR i IN 1..50 LOOP
  INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, consent_status, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_tenant_id,
    v_nombres[1 + floor(random() * array_length(v_nombres,1))::int],
    v_apellidos[1 + floor(random() * array_length(v_apellidos,1))::int] || ' ' || v_apellidos[1 + floor(random() * array_length(v_apellidos,1))::int],
    (7 + floor(random()*13))::text || '.' || lpad(floor(random()*1000)::text,3,'0') || '.' || lpad(floor(random()*1000)::text,3,'0') || '-' || floor(random()*10)::text,
    'Cosecha', 'Temporero', 'approved', true, NOW(), NOW()
  );
END LOOP;

-- Generar 10 de packing
FOR i IN 1..10 LOOP
  INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, consent_status, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_tenant_id,
    v_nombres[1 + floor(random() * array_length(v_nombres,1))::int],
    v_apellidos[1 + floor(random() * array_length(v_apellidos,1))::int],
    (7 + floor(random()*13))::text || '.' || lpad(floor(random()*1000)::text,3,'0') || '.' || lpad(floor(random()*1000)::text,3,'0') || '-' || floor(random()*10)::text,
    'Packing', 'Operario Packing', 'approved', true, NOW(), NOW()
  );
END LOOP;

-- IDs de empleados
SELECT array_agg(id) INTO v_emp_ids FROM employees WHERE tenant_id = v_tenant_id;

-- Marcajes: última semana (lun-sab, cosecha trabaja sábado)
FOR v_date IN SELECT generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval)::date
LOOP
  -- Domingo no se trabaja
  IF EXTRACT(DOW FROM v_date) = 0 THEN CONTINUE; END IF;

  FOREACH v_emp_id IN ARRAY v_emp_ids
  LOOP
    v_r := random();
    -- 92% asistencia (cosecha, alta necesidad)
    IF v_r < 0.92 THEN
      -- Entrada temprano (cosecha empieza 7:00)
      IF random() < 0.75 THEN
        v_entry := v_date + (interval '6 hours 50 minutes' + (random() * 20) * interval '1 minute');
      ELSE
        v_entry := v_date + (interval '7 hours 11 minutes' + (random() * 30) * interval '1 minute');
      END IF;

      INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
      VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'entry', v_entry, 'rut',
        'GPS: -39.6' || (10 + floor(random()*80))::text || ', -72.9' || (10 + floor(random()*80))::text || ' (Mafil)');

      -- Salida (cosecha larga)
      IF random() < 0.80 THEN
        v_exit := v_date + (interval '16 hours' + (random() * 60) * interval '1 minute');
      ELSE
        v_exit := v_date + (interval '17 hours' + (random() * 90) * interval '1 minute');
      END IF;

      INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
      VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'exit', v_exit, 'rut',
        'GPS: -39.6' || (10 + floor(random()*80))::text || ', -72.9' || (10 + floor(random()*80))::text || ' (Mafil)');
    END IF;
  END LOOP;
END LOOP;

RAISE NOTICE 'Pi Berries demo: % trabajadores, tenant: %', array_length(v_emp_ids,1), v_tenant_id;
END $$;
