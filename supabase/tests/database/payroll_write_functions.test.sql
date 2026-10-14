-- Finalize, Undo finalize, Adjustments, Add Cleaner and Off-cycle runs, asserted as admin, employee
-- and anon (20261014231000).
--
-- These tests pin the per-target results, the refusal codes (DETAIL) and the stored runs, claims
-- and Adjustments, never how the functions are written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql. The real
-- Payroll start may leave no ended period yet, so payroll_settings() is replaced (inside this
-- transaction) with an anchor and start two periods back from today's: "the period" below is the
-- one just ended, the one before it is before the Payroll start, and today's is still running.

begin;

create extension if not exists pgtap with schema extensions;

select plan(98);


-- Helpers (as postgres) ------------------------------------------------------------------------

do $$
declare
	start_day date := public.pay_period_start((now() at time zone 'America/Toronto')::date) - 14;
begin
	execute format($sql$
		create or replace function public.payroll_settings(out pay_period_anchor date, out payroll_start date)
			language sql immutable
			set search_path to ''
			as $body$ select %L::date, %L::date; $body$
	$sql$, start_day, start_day);
end;
$$;

-- The ended period under test, the running one and the one before the Payroll start.
create function public.pgtap_period() returns date
	language sql stable
	as $$ select (public.payroll_settings()).payroll_start; $$;

create function public.pgtap_running_period() returns date
	language sql stable
	as $$ select public.pgtap_period() + 14; $$;

create function public.pgtap_early_period() returns date
	language sql stable
	as $$ select public.pgtap_period() - 14; $$;

-- An instant on day day_index of the period under test, at a Toronto wall-clock time.
create function public.pgtap_at(day_index integer, wall_time time) returns timestamptz
	language sql stable
	as $$ select ((public.pgtap_period() + day_index) + wall_time) at time zone 'America/Toronto'; $$;

-- Runs a statement as the current role and returns the code (DETAIL) it raised, or null.
create function public.pgtap_refusal(statement text) returns text
	language plpgsql
	as $$
declare
	raised_detail text;
begin
	execute statement;
	return null;
exception when others then
	get stacked diagnostics raised_detail = pg_exception_detail;
	return raised_detail;
end;
$$;

-- One finalize target, as the app sends it.
create function public.pgtap_target(employee_id uuid, period_start date) returns jsonb
	language sql immutable
	as $$ select jsonb_build_object('employee_id', employee_id, 'period_start', period_start); $$;

create function public.pgtap_claims(run_id uuid) returns uuid[]
	language sql stable security definer
	as $$
	select coalesce(array_agg(appointment_employee_id order by appointment_employee_id), '{}')
	from public.pay_run_lines where pay_run_id = run_id;
$$;

create function public.pgtap_run(employee_id uuid, kind text) returns public.pay_runs
	language sql stable security definer
	as $$
	select * from public.pay_runs
	where pay_runs.employee_id = pgtap_run.employee_id
		and pay_runs.period_start = public.pgtap_period()
		and pay_runs.kind = pgtap_run.kind;
$$;

create function public.pgtap_admin_claims() returns text
	language sql immutable
	as $$ select '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}'; $$;


-- Fixtures (as postgres) -----------------------------------------------------------------------
--
-- A: two closed shifts with a rate, one an Odd duration. B: one closed shift, no Pay rate.
-- C: a closed shift, an Open shift and a Missing clock, plus cancelled visits that don't count.
-- D: no shifts. E: one closed shift; a straggler is added after finalize. F: one short shift.
-- G: a paid run with an Adjustment. H: a stored regular draft and a Missing clock. I: no shifts.

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test');

-- Every other Cleaner gets a login too (employees.user_id is required).
insert into auth.users (id, email)
select ('a0000000-0000-4000-8000-0000000001' || suffix)::uuid, 'pgtap.employee.' || suffix || '@example.test'
from unnest(array['0b', '0c', '0d', '0e', '0f', '10', '11', '12']) as suffix;

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false),
	('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000010b', 'Employee B', true, false),
	('e0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000010c', 'Employee C', true, false),
	('e0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000010d', 'Employee D', true, false),
	('e0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-00000000010e', 'Employee E', true, false),
	('e0000000-0000-4000-8000-00000000000f', 'a0000000-0000-4000-8000-00000000010f', 'Employee F', true, false),
	('e0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000110', 'Employee G', true, false),
	('e0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000111', 'Employee H', true, false),
	('e0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000112', 'Employee I', false, false);

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'Smith Residence');

insert into public.client_locations (id, client_id, label, address) values
	('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b0000000-0000-4000-8000-000000000001', 'Standard Clean', 4500, false);

insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from)
select employee_id::uuid, 2300, public.pgtap_period()
from unnest(array[
	'e0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000c',
	'e0000000-0000-4000-8000-00000000000e', 'e0000000-0000-4000-8000-00000000000f'
]) as employee_id;

-- One visit and one session per row: (session id, employee, day of the period, start, end, status,
-- clock-in, clock-out). Session and visit ids share their last digits.
create function public.pgtap_shift(session_id uuid, employee_id uuid, day_index integer, starts time, ends time,
	visit_status text, clock_in timestamptz, clock_out timestamptz) returns void
	language sql
	as $$
	insert into public.appointments (
		id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, is_archived
	) values (
		('d' || substr(session_id::text, 2))::uuid, 'c0000000-0000-4000-8000-000000000001',
		'b0000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
		public.pgtap_period() + day_index, starts, ends, visit_status, false
	);
	insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at)
	values (session_id, ('d' || substr(session_id::text, 2))::uuid, employee_id, false, clock_in, clock_out);
$$;

select public.pgtap_shift('f0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-00000000000a', 1, '09:00', '12:00', 'scheduled',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '12:00'));
-- Odd duration: 30 minutes of a two-hour visit. It never blocks.
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-00000000000a', 2, '09:00', '11:00', 'scheduled',
	public.pgtap_at(2, '09:00'), public.pgtap_at(2, '09:30'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-00000000000b', 1, '09:00', '10:00', 'scheduled',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-00000000000c', 3, '09:00', '10:00', 'scheduled',
	public.pgtap_at(3, '09:00'), public.pgtap_at(3, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000c2', 'e0000000-0000-4000-8000-00000000000c', 4, '09:00', '10:00', 'scheduled',
	public.pgtap_at(4, '09:00'), null);
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000c3', 'e0000000-0000-4000-8000-00000000000c', 5, '09:00', '10:00', 'scheduled',
	null, null);
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000c4', 'e0000000-0000-4000-8000-00000000000c', 6, '09:00', '10:00', 'cancelled',
	public.pgtap_at(6, '09:00'), null);
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000c5', 'e0000000-0000-4000-8000-00000000000c', 6, '11:00', '12:00', 'cancelled',
	null, null);
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000e1', 'e0000000-0000-4000-8000-00000000000e', 1, '09:00', '10:00', 'scheduled',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000f1', 'e0000000-0000-4000-8000-00000000000f', 1, '09:00', '10:00', 'scheduled',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000011', 2, '09:00', '10:00', 'scheduled',
	null, null);

insert into public.pay_runs (id, employee_id, period_start, kind, status, finalized_at, paid_on, payout_method, paid_at, created_by) values
	('70000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000010', public.pgtap_period(), 'regular', 'paid',
	 now(), public.pgtap_period() + 14, 'Cash', now(), 'a0000000-0000-4000-8000-000000000001'),
	('70000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000011', public.pgtap_period(), 'regular', 'draft',
	 null, null, null, null, 'a0000000-0000-4000-8000-000000000001');

insert into public.pay_adjustments (id, pay_run_id, amount_cents, reason, created_by) values
	('60000000-0000-4000-8000-000000000010', '70000000-0000-4000-8000-000000000010', 1500, 'Gas', 'a0000000-0000-4000-8000-000000000001');


-- As an employee -------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(public.pgtap_refusal($$
	select public.finalize_pay_runs(jsonb_build_array(public.pgtap_target('e0000000-0000-4000-8000-00000000000a', public.pgtap_period())))
$$), 'not_admin', 'an employee can''t finalize, even her own run');
select is(public.pgtap_refusal($$ select public.undo_finalize_pay_run('70000000-0000-4000-8000-000000000010') $$),
	'not_admin', 'an employee can''t undo a finalize');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 500, 'Gas', null)
$$), 'not_admin', 'an employee can''t add an Adjustment');
select is(public.pgtap_refusal($$ select public.delete_pay_adjustment('60000000-0000-4000-8000-000000000010') $$),
	'not_admin', 'an employee can''t delete an Adjustment');
select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000d', public.pgtap_period()) $$),
	'not_admin', 'an employee can''t add a Cleaner to a period');
select is(public.pgtap_refusal($$ select public.remove_cleaner_from_pay_period('e0000000-0000-4000-8000-000000000011', public.pgtap_period()) $$),
	'not_admin', 'an employee can''t remove a Cleaner from a period');
select is(public.pgtap_refusal($$ select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000a', public.pgtap_period()) $$),
	'not_admin', 'an employee can''t start an off-cycle run');


-- As anon --------------------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(public.pgtap_refusal($$
	select public.finalize_pay_runs(jsonb_build_array(public.pgtap_target('e0000000-0000-4000-8000-00000000000a', public.pgtap_period())))
$$), 'not_admin', 'anon can''t finalize');
select is(public.pgtap_refusal($$ select public.undo_finalize_pay_run('70000000-0000-4000-8000-000000000010') $$),
	'not_admin', 'anon can''t undo a finalize');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 500, 'Gas', null)
$$), 'not_admin', 'anon can''t add an Adjustment');
select is(public.pgtap_refusal($$ select public.delete_pay_adjustment('60000000-0000-4000-8000-000000000010') $$),
	'not_admin', 'anon can''t delete an Adjustment');
select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000d', public.pgtap_period()) $$),
	'not_admin', 'anon can''t add a Cleaner to a period');
select is(public.pgtap_refusal($$ select public.remove_cleaner_from_pay_period('e0000000-0000-4000-8000-000000000011', public.pgtap_period()) $$),
	'not_admin', 'anon can''t remove a Cleaner from a period');
select is(public.pgtap_refusal($$ select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000a', public.pgtap_period()) $$),
	'not_admin', 'anon can''t start an off-cycle run');

reset role;

select is((select count(*) from public.pay_runs where employee_id <> 'e0000000-0000-4000-8000-000000000010'
	and employee_id <> 'e0000000-0000-4000-8000-000000000011' and period_start = public.pgtap_period()), 0::bigint,
	'the employee and anon stored no run');
select is((select count(*) from public.pay_adjustments where id = '60000000-0000-4000-8000-000000000010'), 1::bigint,
	'the employee and anon deleted no Adjustment');


-- As admin -------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select is(public.pgtap_refusal($$ select public.payroll_error('no_such_code') $$), 'unknown_payroll_error',
	'payroll_error refuses a code it doesn''t know');
select throws_ok($$ select public.payroll_error('run_paid') $$, 'P0001', 'This Pay run is paid and can''t change.',
	'payroll_error raises a readable message');


-- Finalize: period checks ----------------------------------------------------------------------

select results_eq($$
	select code, detail, pay_run_id from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000a', public.pgtap_running_period())))
$$, $$ values ('period_not_ended'::text, null::jsonb, null::uuid) $$, 'finalize is refused while the period is running');
select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000a', public.pgtap_early_period())))
$$, $$ values ('before_payroll_start'::text) $$, 'finalize is refused before the Payroll start');


-- Finalize: one call, several Cleaners ---------------------------------------------------------

create temporary table pgtap_first_finalize on commit drop as
select * from public.finalize_pay_runs(jsonb_build_array(
	public.pgtap_target('e0000000-0000-4000-8000-00000000000d', public.pgtap_period()),
	public.pgtap_target('e0000000-0000-4000-8000-00000000000c', public.pgtap_period()),
	public.pgtap_target('e0000000-0000-4000-8000-00000000000b', public.pgtap_period()),
	public.pgtap_target('e0000000-0000-4000-8000-00000000000a', public.pgtap_period())));

select results_eq($$ select employee_id, period_start, code, detail from pgtap_first_finalize order by employee_id $$,
	$$ values
		('e0000000-0000-4000-8000-00000000000a'::uuid, public.pgtap_period(), 'ok'::text, null::jsonb),
		('e0000000-0000-4000-8000-00000000000b'::uuid, public.pgtap_period(), 'blocked', '{"open_shift": 0, "missing_clock": 0, "no_rate": 1}'::jsonb),
		('e0000000-0000-4000-8000-00000000000c'::uuid, public.pgtap_period(), 'blocked', '{"open_shift": 1, "missing_clock": 1, "no_rate": 0}'::jsonb),
		('e0000000-0000-4000-8000-00000000000d'::uuid, public.pgtap_period(), 'nothing_to_finalize', null)
	$$, 'one call finalizes A while B and C are blocked (counts per kind) and D has nothing to finalize');
select is((select message from pgtap_first_finalize where code = 'blocked' limit 1),
	'Fix this Cleaner''s problem sessions and Pay rate to finalize.', 'a refused target carries the readable message');
select is((select pay_run_id from pgtap_first_finalize where code = 'ok'),
	(public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).id, 'a finalized target returns its run');

select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).status, 'finalized',
	'A''s regular run is stored as finalized');
select isnt((public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).finalized_at, null,
	'finalize stamps finalized_at');
select is(public.pgtap_claims((public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).id),
	array['f0000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a2']::uuid[],
	'finalize claims every draft line, the Odd duration one included');
select is((select count(*) from public.pay_runs where employee_id in (
		'e0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-00000000000d')),
	0::bigint, 'a refused target stores no run');

select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000a', public.pgtap_period())))
$$, $$ values ('nothing_to_finalize'::text) $$, 'a second finalize finds nothing to finalize');
select is(cardinality(public.pgtap_claims((public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).id)), 2,
	'a second finalize claims nothing again');
select results_eq($$ select count(*) from public.finalize_pay_runs('[]'::jsonb) $$, $$ values (0::bigint) $$,
	'an empty target list returns no results');


-- Undo finalize --------------------------------------------------------------------------------

select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 2500, 'Supplies',
		'f0000000-0000-4000-8000-0000000000a1')
$$), null, 'an Adjustment on a finalized, unpaid run can point at one of its claimed sessions');

select is(public.pgtap_refusal(format('select public.undo_finalize_pay_run(%L)',
	(public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).id)), null, 'undo finalize is accepted');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).status, 'draft', 'undo finalize returns the run to draft');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).finalized_at, null, 'undo finalize clears finalized_at');
select is(public.pgtap_claims((public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).id), '{}'::uuid[],
	'undo finalize releases the claims');
select is((select count(*) from public.pay_adjustments where pay_run_id = (public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).id),
	1::bigint, 'undo finalize keeps the Adjustments');
select is(public.pgtap_refusal(format('select public.undo_finalize_pay_run(%L)',
	(public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).id)), 'not_finalized', 'a draft can''t be undone');
select is(public.pgtap_refusal($$ select public.undo_finalize_pay_run('70000000-0000-4000-8000-000000000010') $$),
	'not_finalized', 'a paid run can''t be undone');
select is(public.pgtap_refusal($$ select public.undo_finalize_pay_run('70000000-0000-4000-8000-0000000000ff') $$),
	'run_not_found', 'an unknown run can''t be undone');

select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000a', public.pgtap_period())))
$$, $$ values ('ok'::text) $$, 'a run returned to draft finalizes again');
select is(public.pgtap_claims((public.pgtap_run('e0000000-0000-4000-8000-00000000000a', 'regular')).id),
	array['f0000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a2']::uuid[],
	'finalizing again claims the same sessions');


-- Adjustments ----------------------------------------------------------------------------------

select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_running_period(), 500, 'Gas', null)
$$), 'period_not_ended', 'an Adjustment is refused while the period is running');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_early_period(), 500, 'Gas', null)
$$), 'before_payroll_start', 'an Adjustment is refused before the Payroll start');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 0, 'Gas', null)
$$), 'amount_required', 'a $0 Adjustment is refused');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), null, 'Gas', null)
$$), 'amount_required', 'an Adjustment with no amount is refused');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 500, '   ', null)
$$), 'reason_required', 'an Adjustment with a blank reason is refused');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 500, null, null)
$$), 'reason_required', 'an Adjustment with no reason is refused');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 500, 'Gas',
		'f0000000-0000-4000-8000-0000000000b1')
$$), 'appointment_not_on_run', 'an Adjustment can''t point at another Cleaner''s session');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000c', public.pgtap_period(), 500, 'Gas',
		'f0000000-0000-4000-8000-0000000000c2')
$$), 'appointment_not_on_run', 'an Adjustment can''t point at an Open shift, which isn''t a line');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-000000000010', public.pgtap_period(), 500, 'Gas', null)
$$), 'run_paid', 'an Adjustment is refused when the Cleaner''s run is paid');
select is((select count(*) from public.pay_runs where employee_id = 'e0000000-0000-4000-8000-00000000000c'), 0::bigint,
	'a refused Adjustment stores no run');

create temporary table pgtap_adjustment on commit drop as
select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000f', public.pgtap_period(), -5000,
	'  Overpaid last run  ', 'f0000000-0000-4000-8000-0000000000f1') as id;

select results_eq($$
	select adjustment.amount_cents, adjustment.reason, adjustment.appointment_employee_id, run.kind, run.status
	from public.pay_adjustments adjustment
	join public.pay_runs run on run.id = adjustment.pay_run_id
	where adjustment.id = (select id from pgtap_adjustment)
$$, $$ values (-5000, 'Overpaid last run'::text, 'f0000000-0000-4000-8000-0000000000f1'::uuid, 'regular'::text, 'draft'::text) $$,
	'an Adjustment on a Cleaner with no stored run creates her regular draft, stores the reason trimmed and links a draft line');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000f', 'regular')).created_by, 'a0000000-0000-4000-8000-000000000001'::uuid,
	'the created run records the admin');

select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000f', public.pgtap_period())))
$$, $$ values ('ok'::text) $$, 'a run with a negative total finalizes');
select is(public.pgtap_claims((public.pgtap_run('e0000000-0000-4000-8000-00000000000f', 'regular')).id),
	array['f0000000-0000-4000-8000-0000000000f1']::uuid[], 'finalize keeps the stored draft row and claims its line');

select is(public.pgtap_refusal($$ select public.delete_pay_adjustment('60000000-0000-4000-8000-000000000010') $$),
	'run_paid', 'an Adjustment on a paid run can''t be deleted');
select is(public.pgtap_refusal($$ select public.delete_pay_adjustment('60000000-0000-4000-8000-0000000000ff') $$),
	'adjustment_not_found', 'an unknown Adjustment can''t be deleted');
select is(public.pgtap_refusal(format('select public.delete_pay_adjustment(%L)', (select id from pgtap_adjustment))),
	null, 'an Adjustment on an unpaid run is deleted');
select is((select count(*) from public.pay_adjustments where id = (select id from pgtap_adjustment)), 0::bigint,
	'the deleted Adjustment is gone');


-- Add Cleaner and remove -----------------------------------------------------------------------

select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000d', public.pgtap_running_period()) $$),
	'period_not_ended', 'a Cleaner can''t be added to a running period');
select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000d', public.pgtap_early_period()) $$),
	'before_payroll_start', 'a Cleaner can''t be added before the Payroll start');

create temporary table pgtap_added_run on commit drop as
select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000d', public.pgtap_period()) as id;

select is((select id from pgtap_added_run), (public.pgtap_run('e0000000-0000-4000-8000-00000000000d', 'regular')).id,
	'Add Cleaner returns the run it stores');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000d', 'regular')).status, 'draft',
	'Add Cleaner stores an empty regular draft for a Cleaner with no shifts');
select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000d', public.pgtap_period()) $$),
	'already_in_period', 'a Cleaner can''t be added twice');
select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000a', public.pgtap_period()) $$),
	'already_in_period', 'a Cleaner with a finalized run can''t be added');
select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000b', public.pgtap_period()) $$),
	'already_in_period', 'a Cleaner with a computed draft (a closed shift) can''t be added');
select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000000c', public.pgtap_period()) $$),
	'already_in_period', 'a Cleaner with problem sessions can''t be added');

select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000d', public.pgtap_period())))
$$, $$ values ('ok'::text) $$, 'a $0 run finalizes');

select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-000000000012', public.pgtap_period()) $$),
	null, 'an inactive Cleaner can be added');
select is(public.pgtap_refusal($$ select public.remove_cleaner_from_pay_period('e0000000-0000-4000-8000-000000000012', public.pgtap_period()) $$),
	null, 'removing an empty added Cleaner is accepted');
select is((public.pgtap_run('e0000000-0000-4000-8000-000000000012', 'regular')).id, null, 'remove deletes the empty draft row');
select is(public.pgtap_refusal($$ select public.remove_cleaner_from_pay_period('e0000000-0000-4000-8000-000000000012', public.pgtap_period()) $$),
	'run_not_found', 'a Cleaner with no stored draft can''t be removed');

select is(public.pgtap_refusal($$ select public.remove_cleaner_from_pay_period('e0000000-0000-4000-8000-000000000011', public.pgtap_period()) $$),
	'run_not_empty', 'a draft with a problem session can''t be removed');
select is(public.pgtap_refusal($$ select public.remove_cleaner_from_pay_period('e0000000-0000-4000-8000-00000000000d', public.pgtap_period()) $$),
	'run_not_found', 'a finalized run isn''t a draft to remove');

select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-000000000012', public.pgtap_period()) $$),
	null, 'a removed Cleaner can be added again');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-000000000012', public.pgtap_period(), 1000, 'Bonus', null)
$$), null, 'an Adjustment goes on the added Cleaner''s draft');
select is(public.pgtap_refusal($$ select public.remove_cleaner_from_pay_period('e0000000-0000-4000-8000-000000000012', public.pgtap_period()) $$),
	'run_not_empty', 'a draft with an Adjustment can''t be removed');
select is(public.pgtap_refusal($$ select public.remove_cleaner_from_pay_period('e0000000-0000-4000-8000-00000000000f', public.pgtap_period()) $$),
	'run_not_found', 'a finalized run with lines isn''t a draft to remove');


-- Off-cycle runs -------------------------------------------------------------------------------

select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000e', public.pgtap_period())))
$$, $$ values ('ok'::text) $$, 'E''s regular run finalizes');

select is(public.pgtap_refusal($$ select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000e', public.pgtap_period()) $$),
	'no_stragglers', 'an off-cycle run needs a straggler');
select is(public.pgtap_refusal($$ select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000b', public.pgtap_period()) $$),
	'no_stragglers', 'unclaimed shifts aren''t stragglers while the regular run is still a draft');

-- A shift entered after E's run was finalized: a straggler.
reset role;
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000e2', 'e0000000-0000-4000-8000-00000000000e', 7, '09:00', '11:00', 'scheduled',
	public.pgtap_at(7, '09:00'), public.pgtap_at(7, '11:00'));
set local role authenticated;

select is(public.pgtap_refusal($$ select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000e', public.pgtap_running_period()) $$),
	'period_not_ended', 'an off-cycle run can''t start in a running period');
select is(public.pgtap_refusal($$ select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000e', public.pgtap_early_period()) $$),
	'before_payroll_start', 'an off-cycle run can''t start before the Payroll start');

create temporary table pgtap_off_cycle_run on commit drop as
select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000e', public.pgtap_period()) as id;

select is((select id from pgtap_off_cycle_run), (public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'off_cycle')).id,
	'starting an off-cycle run returns it');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'off_cycle')).status, 'draft', 'the off-cycle run starts as a draft');
select is(public.pgtap_refusal($$ select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000e', public.pgtap_period()) $$),
	'draft_exists', 'a second off-cycle draft is refused');

select is(public.pgtap_refusal(format('select public.undo_finalize_pay_run(%L)',
	(public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'regular')).id)), 'has_later_run',
	'a regular run with a later off-cycle run can''t be undone');

select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000e', public.pgtap_period(), 700, 'Late shift bonus',
		'f0000000-0000-4000-8000-0000000000e2')
$$), null, 'an Adjustment can point at a straggler on the off-cycle draft');
select is((select pay_run_id from public.pay_adjustments where appointment_employee_id = 'f0000000-0000-4000-8000-0000000000e2'),
	(public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'off_cycle')).id, 'the Adjustment goes on the off-cycle draft, the current run');

select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000e', public.pgtap_period())))
$$, $$ values ('ok'::text) $$, 'finalizing again finalizes the off-cycle draft');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'off_cycle')).status, 'finalized', 'the off-cycle run is finalized');
select is(public.pgtap_claims((public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'off_cycle')).id),
	array['f0000000-0000-4000-8000-0000000000e2']::uuid[], 'the off-cycle run claims only the straggler');
select is(public.pgtap_claims((public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'regular')).id),
	array['f0000000-0000-4000-8000-0000000000e1']::uuid[], 'the regular run keeps its own claim');
select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000e', public.pgtap_period())))
$$, $$ values ('nothing_to_finalize'::text) $$, 'with both runs finalized there is nothing to finalize');
select is(public.pgtap_refusal($$ select public.start_off_cycle_run('e0000000-0000-4000-8000-00000000000e', public.pgtap_period()) $$),
	'draft_exists', 'a new off-cycle run waits until the unpaid one is paid');

select is(public.pgtap_refusal(format('select public.undo_finalize_pay_run(%L)',
	(public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'off_cycle')).id)), null, 'an off-cycle run can be undone');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000e', 'off_cycle')).status, 'draft', 'the undone off-cycle run is a draft again');


-- The paid run is untouched --------------------------------------------------------------------

reset role;

select results_eq($$
	select status, (select count(*) from public.pay_adjustments where pay_run_id = pay_runs.id)
	from public.pay_runs where id = '70000000-0000-4000-8000-000000000010'
$$, $$ values ('paid'::text, 1::bigint) $$, 'nothing changed the paid run or its Adjustment');

select * from finish();

rollback;
