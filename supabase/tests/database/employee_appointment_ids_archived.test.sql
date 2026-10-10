-- get_employee_appointment_ids(), the crew view and archived assignments, asserted as the caller.
--
-- Crew removal archives an assignment with any session history instead of deleting it
-- (20261010130000). A removed Cleaner must stop seeing the visit, exactly as when the row was
-- deleted; a NULL flag is a live assignment; a re-added Cleaner sees the visit through her fresh
-- row. Through appointment_employees_employee_view a Cleaner never gets an archived row, hers or a
-- teammate's (20261010140000); an admin still gets them all. These tests pin what the caller gets back, never how the function is written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a4000000-0000-4000-8000-000000000001', 'pgtap.archive.ana@example.test'),
	('a4000000-0000-4000-8000-000000000002', 'pgtap.archive.bea@example.test'),
	('a4000000-0000-4000-8000-000000000003', 'pgtap.archive.admin@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e4000000-0000-4000-8000-00000000000a', 'a4000000-0000-4000-8000-000000000001', 'Ana Archive', true, false),
	('e4000000-0000-4000-8000-00000000000b', 'a4000000-0000-4000-8000-000000000002', 'Bea Archive', true, false);

insert into public.clients (id, name) values
	('c4000000-0000-4000-8000-000000000001', 'pgTAP Archive Client');

insert into public.jobs (id, name, hourly_rate_cents) values
	('b4000000-0000-4000-8000-000000000001', 'pgTAP Archive Job', 4500);

insert into public.appointments (
	id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time
) values
	-- Ana is live on the crew.
	('d4000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000001',
	 'b4000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00'),
	-- Ana was removed after clocking: her assignment is archived. Bea stays on it.
	('d4000000-0000-4000-8000-000000000002', 'c4000000-0000-4000-8000-000000000001',
	 'b4000000-0000-4000-8000-000000000001', '2026-10-02', '09:00', '11:00'),
	-- Ana's assignment predates the flag having a value.
	('d4000000-0000-4000-8000-000000000003', 'c4000000-0000-4000-8000-000000000001',
	 'b4000000-0000-4000-8000-000000000001', '2026-10-03', '09:00', '11:00'),
	-- Ana was removed, then re-added: an archived row plus a fresh live one.
	('d4000000-0000-4000-8000-000000000004', 'c4000000-0000-4000-8000-000000000001',
	 'b4000000-0000-4000-8000-000000000001', '2026-10-04', '09:00', '11:00');

insert into public.appointment_employees (id, appointment_id, employee_id, admin_notes, is_archived) values
	('f4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-00000000000a', '', false),
	('f4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-00000000000a', '', true),
	('f4000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-000000000002', 'e4000000-0000-4000-8000-00000000000b', '', false),
	('f4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-000000000003', 'e4000000-0000-4000-8000-00000000000a', '', null),
	('f4000000-0000-4000-8000-000000000005', 'd4000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-00000000000a', '', true),
	('f4000000-0000-4000-8000-000000000006', 'd4000000-0000-4000-8000-000000000004', 'e4000000-0000-4000-8000-00000000000a', '', false);


-- As Ana --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a4000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select results_eq(
	$$ select id from public.get_employee_appointment_ids() as id order by id $$,
	$$ values
		('d4000000-0000-4000-8000-000000000001'::uuid),
		('d4000000-0000-4000-8000-000000000003'::uuid),
		('d4000000-0000-4000-8000-000000000004'::uuid) $$,
	'a Cleaner gets her live, NULL-flagged and re-added visits, once each, and not the one she was removed from'
);

select is_empty(
	$$ select id from public.appointments_employee_view where id = 'd4000000-0000-4000-8000-000000000002' $$,
	'a removed Cleaner no longer sees the visit through the appointments view'
);

select is_empty(
	$$ select id from public.appointment_employees_employee_view where appointment_id = 'd4000000-0000-4000-8000-000000000002' $$,
	'a removed Cleaner no longer sees the visit''s crew'
);

select isnt_empty(
	$$ select id from public.appointments_employee_view where id = 'd4000000-0000-4000-8000-000000000004' $$,
	'a re-added Cleaner sees the visit through her fresh assignment'
);

select results_eq(
	$$ select id from public.appointment_employees_employee_view where appointment_id = 'd4000000-0000-4000-8000-000000000004' $$,
	$$ values ('f4000000-0000-4000-8000-000000000006'::uuid) $$,
	'a re-added Cleaner gets only her live row through the crew view, not her archived one'
);


-- As Bea, still on the visit Ana was removed from ---------------------------------------------

set local request.jwt.claims = '{"sub": "a4000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select results_eq(
	$$ select id from public.get_employee_appointment_ids() as id $$,
	$$ values ('d4000000-0000-4000-8000-000000000002'::uuid) $$,
	'a teammate''s archived row does not hide the visit from a Cleaner still on it'
);

select results_eq(
	$$ select id from public.appointment_employees_employee_view where appointment_id = 'd4000000-0000-4000-8000-000000000002' $$,
	$$ values ('f4000000-0000-4000-8000-000000000003'::uuid) $$,
	'a teammate''s archived row is not returned through the crew view'
);


-- As an admin ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a4000000-0000-4000-8000-000000000003", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select results_eq(
	$$ select id from public.appointment_employees_employee_view where appointment_id = 'd4000000-0000-4000-8000-000000000002' order by id $$,
	$$ values ('f4000000-0000-4000-8000-000000000002'::uuid), ('f4000000-0000-4000-8000-000000000003'::uuid) $$,
	'an admin still gets archived rows through the crew view'
);

reset role;


-- Definer rights are kept ----------------------------------------------------------------------

select is(
	(select prosecdef from pg_proc where oid = 'public.get_employee_appointment_ids()'::regprocedure),
	true,
	'get_employee_appointment_ids still runs with definer rights'
);

select * from finish();

rollback;
