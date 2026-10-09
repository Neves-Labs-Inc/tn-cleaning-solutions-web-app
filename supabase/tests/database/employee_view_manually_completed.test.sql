-- appointments_employee_view exposes Manual completion to the Cleaner pages, row-filtered like the
-- rest of the view: an employee reads the flag on their own appointments only.
--
-- Read both directly and through the assignment -> appointment computed relationship, which is how
-- the schedule pages embed it. Fixtures are built here and rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a1000000-0000-4000-8000-000000000001', 'pgtap.mc.admin@example.test'),
	('a1000000-0000-4000-8000-000000000002', 'pgtap.mc.employee.a@example.test'),
	('a1000000-0000-4000-8000-000000000003', 'pgtap.mc.employee.b@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000002', 'MC Employee A', true, false),
	('e1000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000003', 'MC Employee B', true, false);

insert into public.clients (id, name) values
	('c2000000-0000-4000-8000-000000000001', 'pgTAP MC Client');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b1000000-0000-4000-8000-000000000001', 'pgTAP MC Job', 4500, false);

insert into public.appointments (
	id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, manually_completed
) values
	-- A's, marked complete by an admin.
	('d1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
	 '2026-10-01', '09:00', '11:00', true),
	-- A's, not marked.
	('d1000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
	 '2026-10-02', '09:00', '11:00', false),
	-- B's only, marked complete.
	('d1000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001',
	 '2026-10-03', '09:00', '11:00', true);

insert into public.appointment_employees (id, appointment_id, employee_id) values
	('f1000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-00000000000a'),
	('f1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-00000000000a'),
	('f1000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-00000000000b');


-- Shape (catalog) ------------------------------------------------------------------------------

select col_type_is('public', 'appointments_employee_view', 'manually_completed', 'boolean',
	'appointments view has a boolean manually_completed column');

-- Appended, so every existing column keeps its position.
select is(
	(select column_name::text from information_schema.columns
	 where table_schema = 'public' and table_name = 'appointments_employee_view'
	 order by ordinal_position desc limit 1),
	'manually_completed',
	'manually_completed is the last column of the appointments view'
);

select table_privs_are('public', 'appointments_employee_view', 'authenticated', array['SELECT'],
	'authenticated may still only SELECT from the appointments view');
select table_privs_are('public', 'appointments_employee_view', 'anon', '{}'::text[],
	'anon still has no privilege on the appointments view');
select function_privs_are('private', 'appointments_employee_view', '{}'::name[], 'authenticated', array['EXECUTE'],
	'authenticated can still execute the private appointments function');


-- As employee A --------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a1000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select set_eq(
	'select id, manually_completed from public.appointments_employee_view',
	$$ values ('d1000000-0000-4000-8000-000000000001'::uuid, true), ('d1000000-0000-4000-8000-000000000002'::uuid, false) $$,
	'employee A reads manually_completed on their own appointments only'
);

select set_eq(
	$$ select ae.id, appointment.manually_completed
	   from public.appointment_employees_employee_view ae,
	        public.appointments_employee_view(ae) appointment $$,
	$$ values ('f1000000-0000-4000-8000-000000000001'::uuid, true), ('f1000000-0000-4000-8000-000000000002'::uuid, false) $$,
	'the assignment -> appointment embed carries manually_completed for employee A''s assignments'
);


-- As employee B --------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a1000000-0000-4000-8000-000000000003", "role": "authenticated"}';

select set_eq(
	'select id, manually_completed from public.appointments_employee_view',
	$$ values ('d1000000-0000-4000-8000-000000000003'::uuid, true) $$,
	'employee B reads manually_completed on their one appointment only'
);


-- As anon --------------------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok('select manually_completed from public.appointments_employee_view', '42501', null,
	'anon is denied manually_completed through the appointments view');


reset role;

select * from finish();

rollback;
