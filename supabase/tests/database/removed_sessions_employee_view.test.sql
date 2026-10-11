-- removed_sessions_employee_view, asserted as the caller.
--
-- A Cleaner reads her own Removed sessions (archived assignments) for her Time sheet, never a
-- teammate's, never one on a cancelled or archived visit, and never a price. Reading them must not
-- bring the removed visit back through her appointment views. These tests pin what the caller gets
-- back, never how the view is written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a5000000-0000-4000-8000-000000000001', 'pgtap.removed.ana@example.test'),
	('a5000000-0000-4000-8000-000000000002', 'pgtap.removed.bea@example.test'),
	('a5000000-0000-4000-8000-000000000003', 'pgtap.removed.admin@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e5000000-0000-4000-8000-00000000000a', 'a5000000-0000-4000-8000-000000000001', 'Ana Removed', true, false),
	('e5000000-0000-4000-8000-00000000000b', 'a5000000-0000-4000-8000-000000000002', 'Bea Removed', true, false);

insert into public.clients (id, name) values
	('c5000000-0000-4000-8000-000000000001', 'pgTAP Removed Client');

insert into public.jobs (id, name, hourly_rate_cents) values
	('b5000000-0000-4000-8000-000000000001', 'pgTAP Removed Job', 4500);

insert into public.appointments (
	id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time,
	price_override_cents
) values
	-- Ana was removed after clocking; Bea stays on it.
	('d5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
	 'b5000000-0000-4000-8000-000000000001', '2026-10-02', '09:00', '11:00', 12000),
	-- Bea was removed; Ana stays on it.
	('d5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001',
	 'b5000000-0000-4000-8000-000000000001', '2026-10-03', '09:00', '11:00', null),
	-- Ana was removed, then re-added: an archived row plus a fresh live one.
	('d5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000001',
	 'b5000000-0000-4000-8000-000000000001', '2026-10-04', '09:00', '11:00', null),
	-- Ana was removed from a visit later cancelled, and from one later archived.
	('d5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000001',
	 'b5000000-0000-4000-8000-000000000001', '2026-10-05', '09:00', '11:00', null),
	('d5000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000001',
	 'b5000000-0000-4000-8000-000000000001', '2026-10-06', '09:00', '11:00', null);

insert into public.appointment_employees (
	id, appointment_id, employee_id, admin_notes, is_archived, clocked_in_at, clocked_out_at
) values
	('f5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-00000000000a', 'admin only', true, '2026-10-02 13:04+00', '2026-10-02 15:19+00'),
	('f5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-00000000000b', '', false, null, null),
	('f5000000-0000-4000-8000-000000000003', 'd5000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-00000000000a', '', false, null, null),
	('f5000000-0000-4000-8000-000000000004', 'd5000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-00000000000b', '', true, '2026-10-03 13:00+00', null),
	('f5000000-0000-4000-8000-000000000005', 'd5000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-00000000000a', '', true, '2026-10-04 13:00+00', '2026-10-04 14:00+00'),
	('f5000000-0000-4000-8000-000000000006', 'd5000000-0000-4000-8000-000000000003', 'e5000000-0000-4000-8000-00000000000a', '', false, null, null),
	('f5000000-0000-4000-8000-000000000007', 'd5000000-0000-4000-8000-000000000004', 'e5000000-0000-4000-8000-00000000000a', '', true, '2026-10-05 13:00+00', '2026-10-05 15:00+00'),
	('f5000000-0000-4000-8000-000000000008', 'd5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-00000000000a', '', true, '2026-10-06 13:00+00', '2026-10-06 15:00+00');

-- Status and archiving are set after the crew exists, as they would be in real use.
update public.appointments set status = 'cancelled' where id = 'd5000000-0000-4000-8000-000000000004';
update public.appointments set is_archived = true where id = 'd5000000-0000-4000-8000-000000000005';


-- No price column (catalog) -------------------------------------------------------------------

select columns_are(
	'public', 'removed_sessions_employee_view',
	array['id', 'appointment_id', 'employee_id', 'scheduled_date', 'client_name', 'job_name',
		'clocked_in_at', 'clocked_out_at'],
	'the view exposes only the Time sheet columns: no price, no admin notes'
);


select table_privs_are(
	'public', 'removed_sessions_employee_view', 'authenticated', array['SELECT'],
	'a signed-in caller holds SELECT only on the view'
);


-- As Ana --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a5000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select results_eq(
	$$ select id, scheduled_date, client_name, job_name, clocked_in_at, clocked_out_at
		from public.removed_sessions_employee_view order by scheduled_date $$,
	$$ values
		('f5000000-0000-4000-8000-000000000001'::uuid, '2026-10-02'::date, 'pgTAP Removed Client', 'pgTAP Removed Job',
		 '2026-10-02 13:04+00'::timestamptz, '2026-10-02 15:19+00'::timestamptz),
		('f5000000-0000-4000-8000-000000000005'::uuid, '2026-10-04'::date, 'pgTAP Removed Client', 'pgTAP Removed Job',
		 '2026-10-04 13:00+00'::timestamptz, '2026-10-04 14:00+00'::timestamptz) $$,
	'a Cleaner reads her own Removed sessions with date, client, Job and clocks, re-added visit included'
);

select is_empty(
	$$ select id from public.removed_sessions_employee_view where id = 'f5000000-0000-4000-8000-000000000004' $$,
	'a Cleaner does not read a teammate''s Removed session'
);

select is_empty(
	$$ select id from public.removed_sessions_employee_view
		where appointment_id in ('d5000000-0000-4000-8000-000000000004', 'd5000000-0000-4000-8000-000000000005') $$,
	'a Cleaner does not read a Removed session on a cancelled or archived visit'
);

select is_empty(
	$$ select id from public.appointments_employee_view where id = 'd5000000-0000-4000-8000-000000000001' $$,
	'the removed visit stays absent from her appointments view'
);

select is_empty(
	$$ select id from public.appointment_employees_employee_view where appointment_id = 'd5000000-0000-4000-8000-000000000001' $$,
	'the removed visit stays absent from her crew view'
);

select is_empty(
	$$ select id from public.get_employee_appointment_ids() as id where id = 'd5000000-0000-4000-8000-000000000001' $$,
	'the removed visit stays absent from her appointment ids'
);

-- The view is not auto-updatable, so Postgres refuses a write before checking privileges.
select throws_ok(
	$$ insert into public.removed_sessions_employee_view (id) values (gen_random_uuid()) $$,
	'55000',
	null,
	'a Cleaner cannot write through the view'
);


-- As Bea --------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a5000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select results_eq(
	$$ select id from public.removed_sessions_employee_view $$,
	$$ values ('f5000000-0000-4000-8000-000000000004'::uuid) $$,
	'a teammate reads only her own Removed session'
);


-- As an admin ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a5000000-0000-4000-8000-000000000003", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is_empty(
	$$ select id from public.removed_sessions_employee_view $$,
	'an admin, who is no Cleaner, gets no rows: the admin Time sheet reads the base table'
);


-- As anon -------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
	$$ select id from public.removed_sessions_employee_view $$,
	'42501',
	null,
	'an unauthenticated caller cannot read the view'
);

reset role;

select * from finish();

rollback;
