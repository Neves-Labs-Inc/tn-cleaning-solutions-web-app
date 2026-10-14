-- Mark paid, payout edits, frozen amounts and the paid_pay_run clock lock, asserted as admin,
-- employee and anon (20261014150000 and 20261014150100).
--
-- These tests pin the per-run results, the refusal codes (DETAIL), the stored runs and claims and
-- what the pay view reports, never how the functions are written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql. As in
-- payroll_write_functions.test.sql, payroll_settings() is replaced (inside this transaction) so
-- "the period" below is the one that just ended: it ends on day 13, before today.

begin;

create extension if not exists pgtap with schema extensions;

select plan(59);


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

create function public.pgtap_period() returns date
	language sql stable
	as $$ select (public.payroll_settings()).payroll_start; $$;

create function public.pgtap_period_end() returns date
	language sql stable
	as $$ select public.pgtap_period() + 13; $$;

create function public.pgtap_today() returns date
	language sql stable
	as $$ select (now() at time zone 'America/Toronto')::date; $$;

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

create function public.pgtap_target(employee_id uuid) returns jsonb
	language sql stable
	as $$ select jsonb_build_object('employee_id', employee_id, 'period_start', public.pgtap_period()); $$;

-- One Mark paid item, as the app sends it.
create function public.pgtap_item(run_id uuid, payout_method text) returns jsonb
	language sql immutable
	as $$ select jsonb_build_object('run_id', run_id, 'payout_method', payout_method); $$;

create function public.pgtap_run(employee_id uuid) returns public.pay_runs
	language sql stable security definer
	as $$
	select * from public.pay_runs
	where pay_runs.employee_id = pgtap_run.employee_id
		and pay_runs.period_start = public.pgtap_period()
		and pay_runs.kind = 'regular';
$$;

create function public.pgtap_run_id(employee_id uuid) returns uuid
	language sql stable
	as $$ select (public.pgtap_run(employee_id)).id; $$;

create function public.pgtap_claims(run_id uuid) returns uuid[]
	language sql stable security definer
	as $$
	select coalesce(array_agg(appointment_employee_id order by appointment_employee_id), '{}')
	from public.pay_run_lines where pay_run_id = run_id;
$$;

create function public.pgtap_admin_claims() returns text
	language sql immutable
	as $$ select '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "email": "pgtap.admin@example.test", "app_metadata": {"role": "admin"}}'; $$;

-- One visit and one session per row. Session and visit ids share their last digits.
create function public.pgtap_shift(session_id uuid, employee_id uuid, day_index integer, starts time, ends time,
	clock_in timestamptz, clock_out timestamptz) returns void
	language sql
	as $$
	insert into public.appointments (
		id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, is_archived
	) values (
		('d' || substr(session_id::text, 2))::uuid, 'c0000000-0000-4000-8000-000000000001',
		'b0000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
		public.pgtap_period() + day_index, starts, ends, 'scheduled', false
	);
	insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at)
	values (session_id, ('d' || substr(session_id::text, 2))::uuid, employee_id, false, clock_in, clock_out);
$$;


-- Fixtures (as postgres) -----------------------------------------------------------------------
--
-- A: two closed shifts, paid and frozen. K: A's crewmate on her first visit, never finalized.
-- B: a finalized run whose clocks are cleared afterwards (Open shift + Missing clock).
-- C: a finalized run whose Pay rate is archived afterwards. D: four claimed shifts, three of them
-- cancelled, removed or archived before Mark paid. E: a finalized run kept unpaid.
-- H: a stored draft. Z: a $0 run. N: a negative run.

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test');

insert into auth.users (id, email)
select ('a0000000-0000-4000-8000-0000000001' || suffix)::uuid, 'pgtap.employee.' || suffix || '@example.test'
from unnest(array['0b', '0c', '0d', '0e', '11', '1a', '1b', '1c']) as suffix;

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false),
	('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000010b', 'Employee B', true, false),
	('e0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000010c', 'Employee C', true, false),
	('e0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000010d', 'Employee D', true, false),
	('e0000000-0000-4000-8000-00000000000e', 'a0000000-0000-4000-8000-00000000010e', 'Employee E', true, false),
	('e0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000111', 'Employee H', true, false),
	('e0000000-0000-4000-8000-00000000001a', 'a0000000-0000-4000-8000-00000000011a', 'Employee K', true, false),
	('e0000000-0000-4000-8000-00000000001b', 'a0000000-0000-4000-8000-00000000011b', 'Employee Z', true, false),
	('e0000000-0000-4000-8000-00000000001c', 'a0000000-0000-4000-8000-00000000011c', 'Employee N', true, false);

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'Smith Residence');

insert into public.client_locations (id, client_id, label, address) values
	('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, pay_premium_cents, is_archived) values
	('b0000000-0000-4000-8000-000000000001', 'Standard Clean', 4500, 200, false);

insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from)
select employee_id::uuid, 2300, public.pgtap_period()
from unnest(array[
	'e0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000b',
	'e0000000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-00000000000d',
	'e0000000-0000-4000-8000-00000000000e', 'e0000000-0000-4000-8000-00000000001a'
]) as employee_id;

select public.pgtap_shift('f0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-00000000000a', 1, '09:00', '12:00',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '12:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000a2', 'e0000000-0000-4000-8000-00000000000a', 2, '09:00', '10:30',
	public.pgtap_at(2, '09:00'), public.pgtap_at(2, '10:30'));
-- K works A's first visit with her.
insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	('f0000000-0000-4000-8000-0000000001a1', 'd0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-00000000001a', false,
	 public.pgtap_at(1, '09:00'), public.pgtap_at(1, '12:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-00000000000b', 1, '09:00', '10:00',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-00000000000b', 2, '09:00', '10:00',
	public.pgtap_at(2, '09:00'), public.pgtap_at(2, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-00000000000c', 1, '09:00', '10:00',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000d1', 'e0000000-0000-4000-8000-00000000000d', 1, '09:00', '10:00',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000d2', 'e0000000-0000-4000-8000-00000000000d', 2, '09:00', '10:00',
	public.pgtap_at(2, '09:00'), public.pgtap_at(2, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000d3', 'e0000000-0000-4000-8000-00000000000d', 3, '09:00', '10:00',
	public.pgtap_at(3, '09:00'), public.pgtap_at(3, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000d4', 'e0000000-0000-4000-8000-00000000000d', 4, '09:00', '10:00',
	public.pgtap_at(4, '09:00'), public.pgtap_at(4, '10:00'));
select public.pgtap_shift('f0000000-0000-4000-8000-0000000000e1', 'e0000000-0000-4000-8000-00000000000e', 1, '09:00', '10:00',
	public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:00'));

insert into public.pay_runs (id, employee_id, period_start, kind, status, created_by) values
	('70000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000011', public.pgtap_period(), 'regular', 'draft',
	 'a0000000-0000-4000-8000-000000000001');


-- Finalize as admin, then break B, C and D after the fact (as postgres) ------------------------

set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000a'), public.pgtap_target('e0000000-0000-4000-8000-00000000000b'),
		public.pgtap_target('e0000000-0000-4000-8000-00000000000c'), public.pgtap_target('e0000000-0000-4000-8000-00000000000d'),
		public.pgtap_target('e0000000-0000-4000-8000-00000000000e')))
$$, $$ values ('ok'::text), ('ok'), ('ok'), ('ok'), ('ok') $$, 'A, B, C, D and E finalize');

select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000001b', public.pgtap_period()) $$),
	null, 'Z is added with no shifts');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000001c', public.pgtap_period(), -500, 'Overpaid', null)
$$), null, 'N gets a negative Adjustment-only run');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 1500, 'Gas', null)
$$), null, 'A''s finalized run gets an Adjustment before it is paid');
select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000001b'), public.pgtap_target('e0000000-0000-4000-8000-00000000001c')))
$$, $$ values ('ok'::text), ('ok') $$, 'the $0 and negative runs finalize');

reset role;

-- B: one shift's clock-out cleared (an Open shift), the other's clocks cleared (a Missing clock).
update public.appointment_employees set clocked_out_at = null where id = 'f0000000-0000-4000-8000-0000000000b1';
update public.appointment_employees set clocked_in_at = null, clocked_out_at = null where id = 'f0000000-0000-4000-8000-0000000000b2';
-- C: no Pay rate any more.
update public.pay_rates set is_archived = true where employee_id = 'e0000000-0000-4000-8000-00000000000c';
-- D: a cancelled visit (with its clocks cleared, which mustn't block), a removed session and an
-- archived visit. Only d1 stays payable.
update public.appointments set status = 'cancelled' where id = 'd0000000-0000-4000-8000-0000000000d2';
update public.appointment_employees set clocked_in_at = null, clocked_out_at = null where id = 'f0000000-0000-4000-8000-0000000000d2';
update public.appointment_employees set is_archived = true where id = 'f0000000-0000-4000-8000-0000000000d3';
update public.appointments set is_archived = true where id = 'd0000000-0000-4000-8000-0000000000d4';


-- As an employee and anon ----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(public.pgtap_refusal(format('select public.mark_pay_runs_paid(%L, %L)',
	jsonb_build_array(public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), 'Cash')), public.pgtap_today())),
	'not_admin', 'an employee can''t mark a run paid, even her own');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), 'Cash', public.pgtap_today())),
	'not_admin', 'an employee can''t edit a payout');

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(public.pgtap_refusal(format('select public.mark_pay_runs_paid(%L, %L)',
	jsonb_build_array(public.pgtap_item('70000000-0000-4000-8000-000000000011', 'Cash')), public.pgtap_today())),
	'not_admin', 'anon can''t mark a run paid');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	'70000000-0000-4000-8000-000000000011', 'Cash', public.pgtap_today())),
	'not_admin', 'anon can''t edit a payout');

reset role;

select is((select count(*) from public.pay_runs where status = 'paid'), 0::bigint, 'the employee and anon paid nothing');


-- As admin: date refusals ----------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select results_eq(format($$
	select code, message from public.mark_pay_runs_paid(%L, %L)
$$, jsonb_build_array(public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000e'), 'Cash')), public.pgtap_today() + 1),
	$$ values ('paid_on_future'::text, 'The paid date can''t be in the future.'::text) $$,
	'a paid date after the Business date is refused');
select results_eq(format($$
	select code from public.mark_pay_runs_paid(%L, %L)
$$, jsonb_build_array(public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000e'), 'Cash')), public.pgtap_period_end() - 1),
	$$ values ('paid_on_before_period_end'::text) $$, 'a paid date before the period''s last day is refused');
select results_eq(format($$
	select code from public.mark_pay_runs_paid(%L, null)
$$, jsonb_build_array(public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000e'), 'Cash'))),
	$$ values ('paid_on_required'::text) $$, 'a missing paid date is refused');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000e')).status, 'finalized', 'a refused run stays finalized');
select results_eq($$ select count(*) from public.mark_pay_runs_paid('[]'::jsonb, public.pgtap_today()) $$,
	$$ values (0::bigint) $$, 'an empty item list returns no results');


-- As admin: one call, several runs -------------------------------------------------------------

create temporary table pgtap_mark_paid on commit drop as
select * from public.mark_pay_runs_paid(jsonb_build_array(
	public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), '  e-Transfer  '),
	public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'), 'Cash'),
	public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c'), 'Cash'),
	public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000d'), 'Cash'),
	public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000e'), '   '),
	public.pgtap_item('70000000-0000-4000-8000-000000000011', 'Cash'),
	public.pgtap_item('70000000-0000-4000-8000-0000000000ff', 'Cash'),
	public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000001b'), 'Cash'),
	public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000001c'), 'e-Transfer')),
	public.pgtap_period_end());

select results_eq($$ select pay_run_id, code, detail from pgtap_mark_paid order by pay_run_id $$, $$
	select pay_run_id, code, detail from (values
		(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), 'ok'::text, null::jsonb),
		(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'), 'blocked', '{"open_shift": 1, "missing_clock": 1, "no_rate": 0}'::jsonb),
		(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c'), 'blocked', '{"open_shift": 0, "missing_clock": 0, "no_rate": 1}'::jsonb),
		(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000d'), 'ok', null),
		(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000e'), 'method_required', null),
		('70000000-0000-4000-8000-000000000011'::uuid, 'not_finalized', null),
		('70000000-0000-4000-8000-0000000000ff'::uuid, 'run_not_found', null),
		(public.pgtap_run_id('e0000000-0000-4000-8000-00000000001b'), 'ok', null),
		(public.pgtap_run_id('e0000000-0000-4000-8000-00000000001c'), 'ok', null)
	) as expected (pay_run_id, code, detail) order by pay_run_id
$$, 'one call pays A, D, Z and N while the others are refused per run with their code and counts');
select is((select message from pgtap_mark_paid where code = 'method_required'), 'Enter a Payout method.',
	'a refused run carries the readable message');

select results_eq($$
	select status, payout_method, paid_on, paid_at is not null from public.pay_runs
	where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')
$$, $$ values ('paid'::text, 'e-Transfer'::text, public.pgtap_period_end(), true) $$,
	'a paid run stores the trimmed method, the paid date and paid_at');
select results_eq($$
	select status, payout_method from public.pay_runs
	where employee_id in ('e0000000-0000-4000-8000-00000000001b', 'e0000000-0000-4000-8000-00000000001c')
	order by employee_id
$$, $$ values ('paid'::text, 'Cash'::text), ('paid', 'e-Transfer') $$, 'the $0 and negative runs are paid with their method');
select results_eq($$
	select status from public.pay_runs
	where employee_id in ('e0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-00000000000e')
	order by employee_id
$$, $$ values ('finalized'::text), ('finalized'), ('finalized') $$, 'refused runs stay finalized');
select is((public.pgtap_run('e0000000-0000-4000-8000-000000000011')).status, 'draft', 'a refused draft stays a draft');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000b')).payout_method, null, 'a refused run stores no method');
select is(cardinality(public.pgtap_claims(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'))), 2,
	'a blocked run keeps its claims');


-- Frozen lines ---------------------------------------------------------------------------------

select results_eq($$
	select appointment_employee_id, scheduled_date, client_name, job_name, minutes, rate_cents, amount_cents
	from public.pay_run_lines where pay_run_id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')
	order by appointment_employee_id
$$, $$ values
	('f0000000-0000-4000-8000-0000000000a1'::uuid, public.pgtap_period() + 1, 'Smith Residence'::text, 'Standard Clean'::text, 180, 2500, 7500),
	('f0000000-0000-4000-8000-0000000000a2'::uuid, public.pgtap_period() + 2, 'Smith Residence', 'Standard Clean', 90, 2500, 3750)
$$, 'Mark paid freezes each line: date, client, Job, minutes, effective rate (rate + premium) and amount');
select is(public.pgtap_claims(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000d')),
	array['f0000000-0000-4000-8000-0000000000d1']::uuid[],
	'Mark paid releases the claims on a cancelled visit, a removed session and an archived visit');
select is((select count(*) from public.pay_run_lines where appointment_employee_id in (
		'f0000000-0000-4000-8000-0000000000d2', 'f0000000-0000-4000-8000-0000000000d3', 'f0000000-0000-4000-8000-0000000000d4')),
	0::bigint, 'the released sessions are on no run');
select results_eq($$
	select appointment_employee_id, pay_run_id from public.pay_period_sessions
	where appointment_employee_id in ('f0000000-0000-4000-8000-0000000000d1', 'f0000000-0000-4000-8000-0000000000d2')
	order by appointment_employee_id
$$, $$ values
	('f0000000-0000-4000-8000-0000000000d1'::uuid, public.pgtap_run_id('e0000000-0000-4000-8000-00000000000d')),
	('f0000000-0000-4000-8000-0000000000d2', null)
$$, 'the pay view shows the cancelled session off the paid run');

-- Change everything a live line follows (as postgres).
reset role;
update public.pay_rates set hourly_rate_cents = 9900 where employee_id = 'e0000000-0000-4000-8000-00000000000a';
update public.jobs set pay_premium_cents = 0, name = 'Deep Clean' where id = 'b0000000-0000-4000-8000-000000000001';
update public.clients set name = 'Jones Residence' where id = 'c0000000-0000-4000-8000-000000000001';
update public.appointments set scheduled_date = public.pgtap_period() + 5 where id = 'd0000000-0000-4000-8000-0000000000a1';
update public.appointment_employees set clocked_out_at = public.pgtap_at(1, '13:00') where id = 'f0000000-0000-4000-8000-0000000000a1';
set local role authenticated;

select results_eq($$
	select appointment_employee_id, scheduled_date, client_name, job_name, clocked_minutes, effective_rate_cents, amount_cents, pay_run_status
	from public.pay_period_sessions where employee_id = 'e0000000-0000-4000-8000-00000000000a'
	order by appointment_employee_id
$$, $$ values
	('f0000000-0000-4000-8000-0000000000a1'::uuid, public.pgtap_period() + 1, 'Smith Residence'::text, 'Standard Clean'::text, 180, 2500, 7500, 'paid'::text),
	('f0000000-0000-4000-8000-0000000000a2', public.pgtap_period() + 2, 'Smith Residence', 'Standard Clean', 90, 2500, 3750, 'paid')
$$, 'after paid, rate, premium, names, date and clock changes leave the frozen values the pay view reports');
select results_eq($$
	select clocked_minutes, effective_rate_cents, client_name, job_name
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-0000000001a1'
$$, $$ values (180, 2300, 'Jones Residence'::text, 'Deep Clean'::text) $$,
	'the crewmate''s unpaid session on the same visit follows the live values');


-- Paid runs don't change -----------------------------------------------------------------------

select results_eq(format($$
	select code from public.mark_pay_runs_paid(%L, %L)
$$, jsonb_build_array(public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), 'Cash')), public.pgtap_today()),
	$$ values ('not_finalized'::text) $$, 'a paid run can''t be marked paid again');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000a')).payout_method, 'e-Transfer',
	'marking a paid run again changes nothing');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000000a', public.pgtap_period(), 500, 'Gas', null)
$$), 'run_paid', 'an Adjustment can''t be added to a paid run');
select is(public.pgtap_refusal(format('select public.delete_pay_adjustment(%L)',
	(select id from public.pay_adjustments where pay_run_id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')))),
	'run_paid', 'an Adjustment on a paid run can''t be deleted');
select is(public.pgtap_refusal(format('select public.undo_finalize_pay_run(%L)', public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'))),
	'not_finalized', 'a paid run can''t go back to draft');


-- update_pay_run_payout ------------------------------------------------------------------------

select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), '  Cash  ', public.pgtap_today())), null, 'a paid run''s payout is edited');
select results_eq($$
	select status, payout_method, paid_on from public.pay_runs where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')
$$, $$ values ('paid'::text, 'Cash'::text, public.pgtap_today()) $$, 'the edit stores the trimmed method and the new date, and the run stays paid');

select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), '  ', public.pgtap_today())),
	'method_required', 'a payout edit needs a method');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, null, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), public.pgtap_today())),
	'method_required', 'a payout edit with no method is refused');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), 'Cash', public.pgtap_today() + 1)),
	'paid_on_future', 'a payout edit can''t date the payment in the future');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), 'Cash', public.pgtap_period_end() - 1)),
	'paid_on_before_period_end', 'a payout edit can''t date the payment before the period''s last day');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, null)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'), 'Cash')),
	'paid_on_required', 'a payout edit needs a paid date');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000e'), 'Cash', public.pgtap_today())),
	'not_paid', 'a finalized, unpaid run''s payout can''t be edited');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	'70000000-0000-4000-8000-000000000011', 'Cash', public.pgtap_today())),
	'not_paid', 'a draft''s payout can''t be edited');
select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	'70000000-0000-4000-8000-0000000000ff', 'Cash', public.pgtap_today())),
	'run_not_found', 'an unknown run''s payout can''t be edited');
select results_eq($$
	select status, payout_method, paid_on from public.pay_runs where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')
$$, $$ values ('paid'::text, 'Cash'::text, public.pgtap_today()) $$, 'refused edits leave the payout as it was');
select is((public.pgtap_run('e0000000-0000-4000-8000-00000000000e')).status, 'finalized', 'a refused edit doesn''t pay an unpaid run');


-- After the fix, a blocked run pays ------------------------------------------------------------

reset role;
update public.pay_rates set is_archived = false where employee_id = 'e0000000-0000-4000-8000-00000000000c';
set local role authenticated;

select results_eq(format($$
	select code from public.mark_pay_runs_paid(%L, %L)
$$, jsonb_build_array(public.pgtap_item(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c'), 'Cash')), public.pgtap_today()),
	$$ values ('ok'::text) $$, 'once its Pay rate is back, C''s run is paid');
select is((select amount_cents from public.pay_run_lines where appointment_employee_id = 'f0000000-0000-4000-8000-0000000000c1'),
	2300, 'C''s line is frozen at the rate in effect when paid (the premium now 0)');


-- The clock lock -------------------------------------------------------------------------------

select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000000a1', public.pgtap_at(1, '09:00'), public.pgtap_at(1, '11:00'), 'Left early')
$$), 'paid_pay_run', 'a correction to a session on a paid run is refused');
select throws_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000000a1', public.pgtap_at(1, '09:00'), public.pgtap_at(1, '11:00'), 'Left early')
$$, 'P0001', 'This shift is on a paid Pay run; its clocks are locked.', 'the clock lock says why');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000000a2', null, null, 'Wrong Cleaner')
$$), 'paid_pay_run', 'clearing the clocks of a session on a paid run is refused');
select is((select count(*) from public.clock_corrections where appointment_employee_id in (
		'f0000000-0000-4000-8000-0000000000a1', 'f0000000-0000-4000-8000-0000000000a2')),
	0::bigint, 'a refused correction is not recorded');

select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000001a1', public.pgtap_at(1, '09:00'), public.pgtap_at(1, '11:00'), 'Left early')
$$), null, 'the crewmate''s unpaid session on the same visit stays editable');
select is((select clocked_out_at from public.appointment_employees where id = 'f0000000-0000-4000-8000-0000000001a1'),
	public.pgtap_at(1, '11:00'), 'the crewmate''s correction is saved');

select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000000e1', public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:30'), 'Stayed late')
$$), null, 'a session on a finalized, unpaid run stays editable');
select results_eq($$
	select clocked_minutes, amount_cents from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-0000000000e1'
$$, $$ values (90, 3450) $$, 'a finalized, unpaid line follows the corrected clocks');

select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000000d3', public.pgtap_at(3, '09:00'), public.pgtap_at(3, '10:30'), null)
$$), 'session_archived', 'a released, removed session is refused as removed, not as paid');


-- The paid shape --------------------------------------------------------------------------------

reset role;

select is((select count(*) from public.pay_run_lines line join public.pay_runs run on run.id = line.pay_run_id
		where run.status = 'paid' and line.amount_cents is null),
	0::bigint, 'every line on a paid run is frozen');
select is((select count(*) from public.pay_run_lines line join public.pay_runs run on run.id = line.pay_run_id
		where run.status <> 'paid' and line.amount_cents is not null),
	0::bigint, 'no line on an unpaid run is frozen');

select * from finish();

rollback;
