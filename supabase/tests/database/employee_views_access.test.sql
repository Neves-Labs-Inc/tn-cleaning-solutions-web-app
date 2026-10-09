-- Access rules of the four employee-facing views, asserted as the calling role.
--
-- Each view hides admin-only columns from employees, who have no SELECT policy on the base
-- tables behind three of them and can read only their own row of the fourth. These tests pin
-- what a caller can see and do through each view, never how the view is built. The one thing the
-- security_invoker switch moved is which check stops a write first (see "Writes through the views").
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(63);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test'),
	('a0000000-0000-4000-8000-000000000003', 'pgtap.employee.b@example.test'),
	('a0000000-0000-4000-8000-000000000004', 'pgtap.employee.inactive@example.test'),
	('a0000000-0000-4000-8000-000000000005', 'pgtap.employee.archived@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, address, e_transfer_email) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false, '1 A St', 'a@pay.test'),
	('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000003', 'Employee B', true, false, '2 B St', 'b@pay.test'),
	('e0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-000000000004', 'Inactive Employee', false, false, '3 C St', 'c@pay.test'),
	('e0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-000000000005', 'Archived Employee', true, true, '4 D St', 'd@pay.test');

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'pgTAP Client');

insert into public.client_locations (id, client_id, label, address) values
	('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b0000000-0000-4000-8000-000000000001', 'pgTAP Active Job', 4500, false),
	('b0000000-0000-4000-8000-000000000002', 'pgTAP Archived Job', 6000, true);

insert into public.appointments (
	id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time,
	price_override_cents
) values
	-- Assigned to A and B.
	('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00', 9000),
	-- Assigned only to B.
	('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-02', '09:00', '11:00', 12000);

insert into public.appointment_employees (id, appointment_id, employee_id, admin_notes) values
	('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 'note on A'),
	('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000b', 'note on B'),
	('f0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000b', 'note on B only');

-- "All rows" for the admin, and "every visible employee/job" for employee A, are captured here as
-- postgres from the base tables, so the expected sets never pass through a view or a policy.
create temp table expected_all_appointment_ids as select id from public.appointments;
create temp table expected_all_assignment_ids as select id from public.appointment_employees;
create temp table expected_visible_job_ids as select id from public.jobs where not is_archived;
create temp table expected_visible_employee_ids as
	select id from public.employees where is_active and not is_archived;

grant select on expected_all_appointment_ids, expected_all_assignment_ids,
	expected_visible_job_ids, expected_visible_employee_ids to authenticated;


-- Hidden columns (catalog) ---------------------------------------------------------------------

select hasnt_column('public', 'appointment_employees_employee_view', 'admin_notes',
	'assignments view has no admin_notes column');
select hasnt_column('public', 'appointments_employee_view', 'price_override_cents',
	'appointments view has no price_override_cents column');
select hasnt_column('public', 'appointments_employee_view', 'billed_price_cents',
	'appointments view has no billed_price_cents column');
select hasnt_column('public', 'jobs_employee_view', 'hourly_rate_cents',
	'jobs view has no hourly_rate_cents column');
select hasnt_column('public', 'employees_employee_view', 'address',
	'employees view has no address column');
select hasnt_column('public', 'employees_employee_view', 'e_transfer_email',
	'employees view has no e_transfer_email column');


-- Advisor stand-in: no view in public runs with definer rights ---------------------------------

-- Reloptions keep the spelling the view was created with, so every true spelling counts.
select is_empty(
	$$
		select c.relname::text
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public'
			and c.relkind = 'v'
			and not exists (
				select 1
				from unnest(coalesce(c.reloptions, '{}')) as option
				where lower(option) in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')
			)
	$$,
	'every view in public has security_invoker=true'
);


-- Grants: SELECT only for authenticated, nothing for anon ---------------------------------------

select table_privs_are('public', 'appointment_employees_employee_view', 'authenticated', array['SELECT'],
	'authenticated may only SELECT from the assignments view');
select table_privs_are('public', 'appointments_employee_view', 'authenticated', array['SELECT'],
	'authenticated may only SELECT from the appointments view');
select table_privs_are('public', 'jobs_employee_view', 'authenticated', array['SELECT'],
	'authenticated may only SELECT from the jobs view');
select table_privs_are('public', 'employees_employee_view', 'authenticated', array['SELECT'],
	'authenticated may only SELECT from the employees view');

select table_privs_are('public', 'appointment_employees_employee_view', 'anon', '{}'::text[],
	'anon has no privilege on the assignments view');
select table_privs_are('public', 'appointments_employee_view', 'anon', '{}'::text[],
	'anon has no privilege on the appointments view');
select table_privs_are('public', 'jobs_employee_view', 'anon', '{}'::text[],
	'anon has no privilege on the jobs view');
select table_privs_are('public', 'employees_employee_view', 'anon', '{}'::text[],
	'anon has no privilege on the employees view');


-- How the views get their rows without definer rights ------------------------------------------

-- Each view reads a definer-rights function in "private", a schema PostgREST does not expose
-- ("private" is deliberately absent from [api].schemas in supabase/config.toml; SQL cannot see
-- that file, so the check lives in review rather than here).
select is_definer('private', 'appointment_employees_employee_view', '{}'::name[],
	'private.appointment_employees_employee_view() is SECURITY DEFINER');
select is_definer('private', 'appointments_employee_view', '{}'::name[],
	'private.appointments_employee_view() is SECURITY DEFINER');
select is_definer('private', 'jobs_employee_view', '{}'::name[],
	'private.jobs_employee_view() is SECURITY DEFINER');
select is_definer('private', 'employees_employee_view', '{}'::name[],
	'private.employees_employee_view() is SECURITY DEFINER');

select schema_privs_are('private', 'anon', '{}'::text[],
	'anon has no privilege on schema private');
select schema_privs_are('private', 'authenticated', array['USAGE'],
	'authenticated can only use schema private');

-- The computed relationships that restore the page embeds run with the caller's rights, so they
-- add no way around the private functions' row filters.
select isnt_definer('public', 'appointments_employee_view', array['appointment_employees_employee_view'],
	'computed relationship assignment -> appointment is SECURITY INVOKER');
select isnt_definer('public', 'employees_employee_view', array['appointment_employees_employee_view'],
	'computed relationship assignment -> employee is SECURITY INVOKER');
select isnt_definer('public', 'clients', array['appointments_employee_view'],
	'computed relationship appointment -> client is SECURITY INVOKER');
select isnt_definer('public', 'client_locations', array['appointments_employee_view'],
	'computed relationship appointment -> location is SECURITY INVOKER');
select isnt_definer('public', 'jobs_employee_view', array['appointments_employee_view'],
	'computed relationship appointment -> job is SECURITY INVOKER');

-- A SET clause stops Postgres inlining these, and PostgREST calls them once per parent row, so the
-- employee pages would slow quadratically with the employee's assignment count.
select is_empty(
	$$
		select p.oid::regprocedure::text
		from pg_proc p
		join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public'
			and p.oid in (
				'public.appointments_employee_view(public.appointment_employees_employee_view)'::regprocedure,
				'public.employees_employee_view(public.appointment_employees_employee_view)'::regprocedure,
				'public.clients(public.appointments_employee_view)'::regprocedure,
				'public.client_locations(public.appointments_employee_view)'::regprocedure,
				'public.jobs_employee_view(public.appointments_employee_view)'::regprocedure
			)
			and p.proconfig is not null
	$$,
	'computed relationships carry no SET clause, so they stay inlinable'
);


-- As employee A --------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select set_eq(
	'select id from public.appointments_employee_view',
	$$ values ('d0000000-0000-4000-8000-000000000001'::uuid) $$,
	'employee A sees only the appointment they are assigned to'
);

select set_eq(
	'select id from public.appointment_employees_employee_view',
	$$ values ('f0000000-0000-4000-8000-000000000001'::uuid), ('f0000000-0000-4000-8000-000000000002'::uuid) $$,
	'employee A sees their own and their teammate''s assignment on their appointment, nothing else'
);

select set_eq(
	'select id from public.jobs_employee_view',
	'select id from expected_visible_job_ids',
	'employee A sees every non-archived job'
);
select set_has(
	'select id from public.jobs_employee_view',
	$$ values ('b0000000-0000-4000-8000-000000000001'::uuid) $$,
	'employee A sees the active job'
);
select set_hasnt(
	'select id from public.jobs_employee_view',
	$$ values ('b0000000-0000-4000-8000-000000000002'::uuid) $$,
	'employee A does not see the archived job'
);

select set_eq(
	'select id from public.employees_employee_view',
	'select id from expected_visible_employee_ids',
	'employee A sees every active, non-archived employee'
);
select set_has(
	'select id from public.employees_employee_view',
	$$ values ('e0000000-0000-4000-8000-00000000000a'::uuid), ('e0000000-0000-4000-8000-00000000000b'::uuid) $$,
	'employee A sees themselves and teammate B'
);
select set_hasnt(
	'select id from public.employees_employee_view',
	$$ values ('e0000000-0000-4000-8000-00000000000c'::uuid), ('e0000000-0000-4000-8000-00000000000d'::uuid) $$,
	'employee A does not see the inactive or the archived employee'
);

-- The base tables are where the hidden columns live, so an employee must not read them there.
select is_empty('select id from public.appointments',
	'employee A reads no rows from appointments');
select is_empty('select id from public.jobs',
	'employee A reads no rows from jobs');
select is_empty('select id from public.appointment_employees',
	'employee A reads no rows from appointment_employees');
select set_eq(
	'select id from public.employees',
	$$ values ('e0000000-0000-4000-8000-00000000000a'::uuid) $$,
	'employee A reads only their own row from employees'
);


-- Writes through the views fail for authenticated ----------------------------------------------

-- A view over a function is not auto-updatable, so Postgres rejects the write as
-- "cannot insert into view" (55000) before it reaches the privilege check (42501). The privilege
-- layer is pinned separately by the table_privs_are assertions above, so both barriers stay tested.

select throws_ok(
	$$ insert into public.appointment_employees_employee_view (appointment_id, employee_id)
	   values ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000a') $$,
	'55000', null, 'INSERT on the assignments view is denied');
select throws_ok(
	$$ update public.appointment_employees_employee_view set clocked_in_at = now() $$,
	'55000', null, 'UPDATE on the assignments view is denied');
select throws_ok(
	$$ delete from public.appointment_employees_employee_view $$,
	'55000', null, 'DELETE on the assignments view is denied');

select throws_ok(
	$$ insert into public.appointments_employee_view (client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
	   values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2026-10-03', '09:00', '10:00') $$,
	'55000', null, 'INSERT on the appointments view is denied');
select throws_ok(
	$$ update public.appointments_employee_view set notes = 'changed' $$,
	'55000', null, 'UPDATE on the appointments view is denied');
select throws_ok(
	$$ delete from public.appointments_employee_view $$,
	'55000', null, 'DELETE on the appointments view is denied');

select throws_ok(
	$$ insert into public.jobs_employee_view (name) values ('Injected Job') $$,
	'55000', null, 'INSERT on the jobs view is denied');
select throws_ok(
	$$ update public.jobs_employee_view set name = 'Renamed Job' $$,
	'55000', null, 'UPDATE on the jobs view is denied');
select throws_ok(
	$$ delete from public.jobs_employee_view $$,
	'55000', null, 'DELETE on the jobs view is denied');

select throws_ok(
	$$ insert into public.employees_employee_view (user_id, full_name)
	   values ('a0000000-0000-4000-8000-000000000001', 'Injected Employee') $$,
	'55000', null, 'INSERT on the employees view is denied');
select throws_ok(
	$$ update public.employees_employee_view set is_active = false $$,
	'55000', null, 'UPDATE on the employees view is denied');
select throws_ok(
	$$ delete from public.employees_employee_view $$,
	'55000', null, 'DELETE on the employees view is denied');


-- As employee B --------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000003", "role": "authenticated"}';

select set_eq(
	'select id from public.appointments_employee_view',
	$$ values ('d0000000-0000-4000-8000-000000000001'::uuid), ('d0000000-0000-4000-8000-000000000002'::uuid) $$,
	'employee B sees both appointments they are assigned to'
);
select set_eq(
	'select id from public.appointment_employees_employee_view',
	$$ values ('f0000000-0000-4000-8000-000000000001'::uuid), ('f0000000-0000-4000-8000-000000000002'::uuid),
	          ('f0000000-0000-4000-8000-000000000003'::uuid) $$,
	'employee B sees every assignment on their two appointments'
);


-- As admin -------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select set_eq(
	'select id from public.appointments_employee_view',
	'select id from expected_all_appointment_ids',
	'admin sees every appointment through the appointments view'
);
select set_eq(
	'select id from public.appointment_employees_employee_view',
	'select id from expected_all_assignment_ids',
	'admin sees every assignment through the assignments view'
);


-- As anon --------------------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok('select id from public.appointment_employees_employee_view', '42501', null,
	'anon is denied SELECT on the assignments view');
select throws_ok('select id from public.appointments_employee_view', '42501', null,
	'anon is denied SELECT on the appointments view');
select throws_ok('select id from public.jobs_employee_view', '42501', null,
	'anon is denied SELECT on the jobs view');
select throws_ok('select id from public.employees_employee_view', '42501', null,
	'anon is denied SELECT on the employees view');

select throws_ok('select * from private.appointment_employees_employee_view()', '42501', null,
	'anon cannot call the private assignments function');
select throws_ok('select * from private.appointments_employee_view()', '42501', null,
	'anon cannot call the private appointments function');
select throws_ok('select * from private.jobs_employee_view()', '42501', null,
	'anon cannot call the private jobs function');
select throws_ok('select * from private.employees_employee_view()', '42501', null,
	'anon cannot call the private employees function');


reset role;

select * from finish();

rollback;
