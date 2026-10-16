-- private.recompute_paid_pay_run_lines() (20261016120000): lines on paid Pay runs are recomputed
-- under the seconds-dropped Clocked time rule, on their frozen rate.
--
-- Lines are inserted holding the values the old rule froze, then the backfill runs. Asserts the
-- stored lines and the reported counts only. Fixtures are rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);


-- Helpers (as postgres) ------------------------------------------------------------------------

-- minutes, rate_cents, amount_cents, scheduled_date, client_name, job_name of a session's line.
create function public.pgtap_line(session_id uuid) returns text
	language sql stable
	as $$
	select concat_ws('|', minutes, rate_cents, amount_cents, scheduled_date, client_name, job_name)
	from public.pay_run_lines
	where appointment_employee_id = session_id;
$$;


-- Fixtures (as postgres) -----------------------------------------------------------------------

-- A first pass settles whatever paid lines already exist, so the counts below are this file's alone.
select private.recompute_paid_pay_run_lines();

insert into auth.users (id, email) values
	('a8000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a8000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e8000000-0000-4000-8000-00000000000a', 'a8000000-0000-4000-8000-000000000002', 'Employee A', true, false);

insert into public.clients (id, name) values
	('c8000000-0000-4000-8000-000000000001', 'Smith Residence');

insert into public.client_locations (id, client_id, label, address) values
	('c8100000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b8000000-0000-4000-8000-000000000001', 'Standard Clean', 4500, false);

insert into public.appointments (
	id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, is_archived
) values
	('d8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
	 'c8100000-0000-4000-8000-000000000001', '2026-10-06', '09:00', '12:30', 'scheduled', false),
	('d8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
	 'c8100000-0000-4000-8000-000000000001', '2026-10-07', '09:00', '10:00', 'scheduled', false),
	('d8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
	 'c8100000-0000-4000-8000-000000000001', '2026-10-08', '09:00', '12:30', 'scheduled', false),
	('d8000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
	 'c8100000-0000-4000-8000-000000000001', '2026-10-20', '09:00', '12:30', 'scheduled', false);

insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	-- s1 and s3: 9:00:40 to 12:30:10, which the old rule floored to 209 min.
	('f8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-00000000000a', false,
	 '2026-10-06 09:00:40 America/Toronto', '2026-10-06 12:30:10 America/Toronto'),
	('f8000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-00000000000a', false,
	 '2026-10-07 09:00 America/Toronto', '2026-10-07 10:00 America/Toronto'),
	('f8000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-00000000000a', false,
	 '2026-10-08 09:00:40 America/Toronto', '2026-10-08 12:30:10 America/Toronto'),
	('f8000000-0000-4000-8000-000000000004', 'd8000000-0000-4000-8000-000000000004', 'e8000000-0000-4000-8000-00000000000a', false,
	 '2026-10-20 09:00:40 America/Toronto', '2026-10-20 12:30:10 America/Toronto');

insert into public.pay_runs (id, employee_id, period_start, kind, status, finalized_at, paid_on, payout_method, paid_at, created_by) values
	('98000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-00000000000a', '2026-10-05', 'regular', 'paid',
	 '2026-10-19 12:00+00', '2026-10-20', 'e-Transfer', '2026-10-20 12:00+00', 'a8000000-0000-4000-8000-000000000001'),
	('98000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-00000000000a', '2026-10-05', 'off_cycle', 'finalized',
	 '2026-10-19 12:00+00', null, null, null, 'a8000000-0000-4000-8000-000000000001'),
	('98000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-00000000000a', '2026-10-19', 'regular', 'draft',
	 null, null, null, null, 'a8000000-0000-4000-8000-000000000001');

-- Frozen names and dates differ from the live ones, so a rewrite of them would show.
insert into public.pay_run_lines (
	pay_run_id, appointment_employee_id, scheduled_date, client_name, job_name, minutes, rate_cents, amount_cents
) values
	-- Paid, old rule: 209 min at a frozen $25.00/h, though the Cleaner has no live Pay rate.
	('98000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000001',
	 '2026-10-01', 'Frozen Client', 'Frozen Job', 209, 2500, 8708),
	-- Paid, already right under the new rule.
	('98000000-0000-4000-8000-000000000001', 'f8000000-0000-4000-8000-000000000002',
	 '2026-10-07', 'Frozen Client', 'Frozen Job', 60, 2400, 2400),
	-- Finalized, holding old-rule values.
	('98000000-0000-4000-8000-000000000002', 'f8000000-0000-4000-8000-000000000003',
	 '2026-10-08', 'Frozen Client', 'Frozen Job', 209, 2500, 8708);

insert into public.pay_run_lines (pay_run_id, appointment_employee_id) values
	('98000000-0000-4000-8000-000000000003', 'f8000000-0000-4000-8000-000000000004');


-- The backfill ---------------------------------------------------------------------------------

select is(private.recompute_paid_pay_run_lines(), 1, 'the backfill writes the one paid line whose values change');

select is(public.pgtap_line('f8000000-0000-4000-8000-000000000001'), '210|2500|8750|2026-10-01|Frozen Client|Frozen Job',
	'a paid line gets 210 min and $87.50 on its frozen $25.00/h; its date and names stay frozen');
select is(public.pgtap_line('f8000000-0000-4000-8000-000000000002'), '60|2400|2400|2026-10-07|Frozen Client|Frozen Job',
	'a paid line already right is left as it was');
select is(public.pgtap_line('f8000000-0000-4000-8000-000000000003'), '209|2500|8708|2026-10-08|Frozen Client|Frozen Job',
	'a line on a finalized run is untouched');
select is(public.pgtap_line('f8000000-0000-4000-8000-000000000004'), '',
	'a line on a draft run stays unfrozen');

select is(private.recompute_paid_pay_run_lines(), 0, 'a second run writes no rows');


-- Who can run it -------------------------------------------------------------------------------

select ok(not has_function_privilege('authenticated', 'private.recompute_paid_pay_run_lines()', 'execute'),
	'authenticated can''t run the backfill');
select ok(not has_function_privilege('anon', 'private.recompute_paid_pay_run_lines()', 'execute'),
	'anon can''t run the backfill');

select * from finish();

rollback;
