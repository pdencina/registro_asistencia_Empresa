-- Seed today's attendance for demo tenant (even if weekend)
DO $$
DECLARE
  v_tenant_id UUID;
  v_emp_id UUID;
  v_entry_time TIMESTAMP;
  v_exit_time TIMESTAMP;
  v_today DATE := CURRENT_DATE;
BEGIN

SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'demo';

-- Delete any existing today records
DELETE FROM attendance_records WHERE tenant_id = v_tenant_id
  AND date(timestamp AT TIME ZONE 'America/Santiago') = v_today;

-- Generate for each employee
FOR v_emp_id IN SELECT id FROM employees WHERE tenant_id = v_tenant_id AND active = true
LOOP
  -- 90% show up today
  IF random() < 0.90 THEN
    -- Entry: 65% on time, 20% slightly late, 15% late
    IF random() < 0.65 THEN
      v_entry_time := v_today + (interval '7 hours 48 minutes' + (random() * 15) * interval '1 minute');
    ELSIF random() < 0.85 THEN
      v_entry_time := v_today + (interval '8 hours 11 minutes' + (random() * 14) * interval '1 minute');
    ELSE
      v_entry_time := v_today + (interval '8 hours 30 minutes' + (random() * 30) * interval '1 minute');
    END IF;

    INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
    VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'entry', v_entry_time, 'visual',
      'GPS: -33.4' || (10 + floor(random()*80))::text || ', -70.6' || (10 + floor(random()*80))::text);

    -- 70% already exited (simulates afternoon)
    IF random() < 0.70 THEN
      v_exit_time := v_today + (interval '15 hours 40 minutes' + (random() * 80) * interval '1 minute');
      INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
      VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'exit', v_exit_time, 'visual',
        'GPS: -33.4' || (10 + floor(random()*80))::text || ', -70.6' || (10 + floor(random()*80))::text);
    END IF;
  END IF;
END LOOP;

RAISE NOTICE 'Today data seeded for demo tenant';
END $$;
