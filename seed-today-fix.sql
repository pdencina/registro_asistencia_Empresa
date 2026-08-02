-- Force today's records using Chile timezone explicitly
DO $$
DECLARE
  v_tenant_id UUID;
  v_emp_id UUID;
  v_entry_time TIMESTAMPTZ;
  v_exit_time TIMESTAMPTZ;
  v_today_str TEXT;
BEGIN

SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'demo';
v_today_str := to_char(NOW() AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD');

-- Delete existing today records
DELETE FROM attendance_records WHERE tenant_id = v_tenant_id
  AND date(timestamp AT TIME ZONE 'America/Santiago') = v_today_str::date;

-- Generate for each employee
FOR v_emp_id IN SELECT id FROM employees WHERE tenant_id = v_tenant_id AND active = true
LOOP
  IF random() < 0.90 THEN
    -- Entry between 7:48 and 9:00 Chile time
    IF random() < 0.65 THEN
      v_entry_time := (v_today_str || ' 07:' || lpad((48 + floor(random()*12))::text, 2, '0') || ':00')::timestamp AT TIME ZONE 'America/Santiago';
    ELSIF random() < 0.85 THEN
      v_entry_time := (v_today_str || ' 08:' || lpad((5 + floor(random()*20))::text, 2, '0') || ':00')::timestamp AT TIME ZONE 'America/Santiago';
    ELSE
      v_entry_time := (v_today_str || ' 08:' || lpad((25 + floor(random()*35))::text, 2, '0') || ':00')::timestamp AT TIME ZONE 'America/Santiago';
    END IF;

    INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
    VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'entry', v_entry_time, 'visual',
      'GPS: -33.41' || floor(random()*90)::text || ', -70.61' || floor(random()*90)::text);

    -- 65% already exited
    IF random() < 0.65 THEN
      v_exit_time := (v_today_str || ' ' || (15 + floor(random()*2))::text || ':' || lpad(floor(random()*59)::text, 2, '0') || ':00')::timestamp AT TIME ZONE 'America/Santiago';
      INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
      VALUES (gen_random_uuid(), v_tenant_id, v_emp_id, 'exit', v_exit_time, 'visual',
        'GPS: -33.41' || floor(random()*90)::text || ', -70.61' || floor(random()*90)::text);
    END IF;
  END IF;
END LOOP;

RAISE NOTICE 'Done. Today (Chile): %', v_today_str;
END $$;
