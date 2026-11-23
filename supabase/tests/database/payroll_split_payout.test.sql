-- Split payout: marking one run paid with parts, Edit payout in both directions, every refusal,
-- the payout_parts readers, asserted as admin, employee and anon (20261123100000).
--
-- These tests pin the stored runs and claims, the refusal codes (DETAIL) and what the readers
-- return, never how the functions are written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql. As in
-- payroll_mark_paid.test.sql, payroll_settings() is replaced (inside this transaction) so "the
-- period" below is the one that just ended: it ends on day 13, before today.

begin;

create extension if not exists pgtap with schema extensions;

select plan(65);


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


-- One part of a split, as the app sends it.
create function public.pgtap_part(method text, amount_cents bigint) returns jsonb
	language sql immutable
	as $$ select jsonb_build_object('method', method, 'amount_cents', amount_cents); $$;

-- Everything a refused call must leave alone: the run row and its lines.
create function public.pgtap_snapshot(run_id uuid) returns jsonb
	language sql stable security definer
	as $$
	select to_jsonb(run) || jsonb_build_object('lines', coalesce(
		(select jsonb_agg(to_jsonb(line) order by line.id) from public.pay_run_lines line where line.pay_run_id = run.id), '[]'::jsonb))
	from public.pay_runs run where run.id = run_id;
$$;

-- A Mark paid with parts, as a statement for pgtap_refusal.
create function public.pgtap_mark_split(run_id uuid, parts jsonb, paid_on date) returns text
	language sql immutable
	as $$ select format('select public.mark_pay_run_paid_with_parts(%L, %L, %L)', run_id, parts, paid_on); $$;

create function public.pgtap_edit_split(run_id uuid, parts jsonb, paid_on date) returns text
	language sql immutable
	as $$ select format('select public.update_pay_run_payout(%L, null, %L, %L)', run_id, paid_on, parts); $$;

-- A $540.00 run: nine hours at the $60.00 Pay rate (the Job has no premium).
create function public.pgtap_big_shift(session_id uuid, employee_id uuid) returns void
	language sql
	as $$ select public.pgtap_shift(session_id, employee_id, 1, '09:00', '18:00', public.pgtap_at(1, '09:00'), public.pgtap_at(1, '18:00')); $$;


-- Fixtures (as postgres) -----------------------------------------------------------------------
--
-- A: a finalized $540.00 run, marked paid with a split. B: a finalized $540.00 run that every
-- refusal is tried on, then paid one way. C: a finalized $540.00 run paid one way, then edited.
-- Z: a finalized $0 run. N: a finalized -$5.00 run. D: a stored draft.

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test');

insert into auth.users (id, email)
select ('a0000000-0000-4000-8000-0000000001' || suffix)::uuid, 'pgtap.employee.' || suffix || '@example.test'
from unnest(array['0b', '0c', '0d', '1b', '1c']) as suffix;

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false),
	('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-00000000010b', 'Employee B', true, false),
	('e0000000-0000-4000-8000-00000000000c', 'a0000000-0000-4000-8000-00000000010c', 'Employee C', true, false),
	('e0000000-0000-4000-8000-00000000000d', 'a0000000-0000-4000-8000-00000000010d', 'Employee D', true, false),
	('e0000000-0000-4000-8000-00000000001b', 'a0000000-0000-4000-8000-00000000011b', 'Employee Z', true, false),
	('e0000000-0000-4000-8000-00000000001c', 'a0000000-0000-4000-8000-00000000011c', 'Employee N', true, false);

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'Smith Residence');

insert into public.client_locations (id, client_id, label, address) values
	('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, pay_premium_cents, is_archived) values
	('b0000000-0000-4000-8000-000000000001', 'Standard Clean', 4500, 0, false);

insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from)
select employee_id::uuid, 6000, public.pgtap_period()
from unnest(array[
	'e0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000c'
]) as employee_id;

select public.pgtap_big_shift('f0000000-0000-4000-8000-0000000000a1', 'e0000000-0000-4000-8000-00000000000a');
select public.pgtap_big_shift('f0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-00000000000b');
select public.pgtap_big_shift('f0000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-00000000000c');

insert into public.pay_runs (id, employee_id, period_start, kind, status, created_by) values
	('70000000-0000-4000-8000-00000000000d', 'e0000000-0000-4000-8000-00000000000d', public.pgtap_period(), 'regular', 'draft',
	 'a0000000-0000-4000-8000-000000000001');


-- Finalize as admin ------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select is(public.pgtap_refusal($$ select public.add_cleaner_to_pay_period('e0000000-0000-4000-8000-00000000001b', public.pgtap_period()) $$),
	null, 'Z is added with no shifts');
select is(public.pgtap_refusal($$
	select public.add_pay_adjustment('e0000000-0000-4000-8000-00000000001c', public.pgtap_period(), -500, 'Overpaid', null)
$$), null, 'N gets a negative Adjustment-only run');
select results_eq($$
	select code from public.finalize_pay_runs(jsonb_build_array(
		public.pgtap_target('e0000000-0000-4000-8000-00000000000a'), public.pgtap_target('e0000000-0000-4000-8000-00000000000b'),
		public.pgtap_target('e0000000-0000-4000-8000-00000000000c'), public.pgtap_target('e0000000-0000-4000-8000-00000000001b'),
		public.pgtap_target('e0000000-0000-4000-8000-00000000001c')))
$$, $$ values ('ok'::text), ('ok'), ('ok'), ('ok'), ('ok') $$, 'A, B, C, Z and N finalize');

reset role;


-- As an employee and anon ----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_today())),
	'not_admin', 'an employee can''t mark her own run paid with parts');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_today())),
	'not_admin', 'an employee can''t edit a payout to a split');

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(public.pgtap_refusal(public.pgtap_mark_split('70000000-0000-4000-8000-00000000000d',
	jsonb_build_array(public.pgtap_part('Cash', 1), public.pgtap_part('e-Transfer', 1)), public.pgtap_today())),
	'not_admin', 'anon can''t mark a run paid with parts');
select is(public.pgtap_refusal(public.pgtap_edit_split('70000000-0000-4000-8000-00000000000d',
	jsonb_build_array(public.pgtap_part('Cash', 1), public.pgtap_part('e-Transfer', 1)), public.pgtap_today())),
	'not_admin', 'anon can''t edit a payout to a split');

reset role;

select is((select count(*) from public.pay_runs where status = 'paid'), 0::bigint, 'the employee and anon paid nothing');


-- As admin: every refusal on Mark paid, nothing written ------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

create temporary table pgtap_before_refusals on commit drop as
select public.pgtap_snapshot(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b')) as snapshot;

select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 54000)), public.pgtap_today())),
	'split_too_few_parts', 'one part is not a split');
select is(public.pgtap_refusal(format('select public.mark_pay_run_paid_with_parts(%L, null, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'), public.pgtap_today())),
	'split_too_few_parts', 'no parts is not a split');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	'{"method": "Cash", "amount_cents": 54000}'::jsonb, public.pgtap_today())),
	'split_too_few_parts', 'parts that aren''t an array are not a split');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('   ', 34000)), public.pgtap_today())),
	'method_required', 'a blank method is refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 54000), public.pgtap_part('e-Transfer', 0)), public.pgtap_today())),
	'split_part_not_positive', 'a $0 part is refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 60000), public.pgtap_part('e-Transfer', -6000)), public.pgtap_today())),
	'split_part_not_positive', 'a negative part is refused even when the sum is right');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), jsonb_build_object('method', 'e-Transfer', 'amount_cents', 33999.5)),
	public.pgtap_today())),
	'split_part_not_positive', 'a part that isn''t whole cents is refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), jsonb_build_object('method', 'e-Transfer')), public.pgtap_today())),
	'split_part_not_positive', 'a part with no amount is refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('  cASH ', 34000)), public.pgtap_today())),
	'split_duplicate_method', 'the same method twice is refused, trimmed and case-insensitive');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 33900)), public.pgtap_today())),
	'split_sum_mismatch', 'parts adding up to less than the total are refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34001)), public.pgtap_today())),
	'split_sum_mismatch', 'parts adding up to more than the total are refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), null)),
	'paid_on_required', 'a missing paid date is refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_today() + 1)),
	'paid_on_future', 'a paid date after the Business date is refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_period_end() - 1)),
	'paid_on_before_period_end', 'a paid date before the period''s last day is refused');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000001b'),
	jsonb_build_array(public.pgtap_part('Cash', 100), public.pgtap_part('e-Transfer', 100)), public.pgtap_today())),
	'split_not_allowed', 'a $0 run can''t be split');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000001c'),
	jsonb_build_array(public.pgtap_part('Cash', 100), public.pgtap_part('e-Transfer', 100)), public.pgtap_today())),
	'split_not_allowed', 'a negative run can''t be split');
select is(public.pgtap_refusal(public.pgtap_mark_split('70000000-0000-4000-8000-00000000000d',
	jsonb_build_array(public.pgtap_part('Cash', 100), public.pgtap_part('e-Transfer', 100)), public.pgtap_today())),
	'not_finalized', 'a draft run can''t be marked paid with parts');
select is(public.pgtap_refusal(public.pgtap_mark_split('70000000-0000-4000-8000-0000000000ff',
	jsonb_build_array(public.pgtap_part('Cash', 100), public.pgtap_part('e-Transfer', 100)), public.pgtap_today())),
	'run_not_found', 'an unknown run is refused');

select is(public.pgtap_snapshot(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b')),
	(select snapshot from pgtap_before_refusals),
	'after every refusal the run is still finalized and its lines are still unfrozen');
select is((select count(*) from public.pay_runs where status = 'paid'), 0::bigint, 'no refusal paid a run');


-- As admin: Mark paid with parts -----------------------------------------------------------------

select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('  Cash ', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_period_end())),
	null, 'a $540.00 run is marked paid with Cash $200.00 + e-Transfer $340.00');

select results_eq($$
	select status, payout_method, paid_on, paid_at is not null, split_parts from public.pay_runs
	where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')
$$, $$ values ('paid'::text, null::text, public.pgtap_period_end(), true,
	'[{"method": "Cash", "amount_cents": 20000}, {"method": "e-Transfer", "amount_cents": 34000}]'::jsonb) $$,
	'the run is paid with no single method, the parts trimmed and in order');
select results_eq($$
	select amount_cents, minutes, rate_cents, scheduled_date is not null, client_name from public.pay_run_lines
	where pay_run_id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')
$$, $$ values (54000, 540, 6000, true, 'Smith Residence') $$, 'its line is frozen as with a single-method Mark paid');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000000a1', public.pgtap_at(1, '09:00'), public.pgtap_at(1, '11:00'), 'Left early')
$$), 'paid_pay_run', 'its clocks are locked');
select is(public.pgtap_refusal(public.pgtap_mark_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_period_end())),
	'not_finalized', 'a paid run can''t be marked paid again');


-- As admin: bulk Mark paid is unchanged ----------------------------------------------------------

select results_eq(format($$
	select code from public.mark_pay_runs_paid(%L, %L)
$$, jsonb_build_array(
	jsonb_build_object('run_id', public.pgtap_run_id('e0000000-0000-4000-8000-00000000000b'), 'payout_method', '  Cash '),
	jsonb_build_object('run_id', public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c'), 'payout_method', 'e-Transfer'),
	jsonb_build_object('run_id', public.pgtap_run_id('e0000000-0000-4000-8000-00000000001b'), 'payout_method', 'Cash'),
	jsonb_build_object('run_id', public.pgtap_run_id('e0000000-0000-4000-8000-00000000001c'), 'payout_method', 'Cash'),
	jsonb_build_object('run_id', '70000000-0000-4000-8000-00000000000d', 'payout_method', 'Cash')), public.pgtap_period_end()),
	$$ values ('ok'::text), ('ok'), ('not_finalized'), ('ok'), ('ok') $$,
	'bulk Mark paid pays B, C, Z and N one method each and still refuses a draft');
select results_eq($$
	select payout_method, split_parts is null from public.pay_runs
	where employee_id in ('e0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000c') order by employee_id
$$, $$ values ('Cash'::text, true), ('e-Transfer', true) $$, 'a bulk-paid run keeps its trimmed method and has no parts stored');


-- As admin: the admin reader ---------------------------------------------------------------------

select results_eq($$
	select payout_method, payout_parts from public.pay_runs_with_payout_parts
	where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')
$$, $$ values (null::text, '[{"method": "Cash", "amount_cents": 20000}, {"method": "e-Transfer", "amount_cents": 34000}]'::jsonb) $$,
	'a split run reads its parts in order and no single method');
select results_eq($$
	select payout_method, payout_parts from public.pay_runs_with_payout_parts
	where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c')
$$, $$ values ('e-Transfer'::text, '[{"method": "e-Transfer", "amount_cents": 54000}]'::jsonb) $$,
	'a single-method run reads one part equal to its total');
select results_eq($$
	select payout_parts from public.pay_runs_with_payout_parts
	where id in (public.pgtap_run_id('e0000000-0000-4000-8000-00000000001b'), public.pgtap_run_id('e0000000-0000-4000-8000-00000000001c'))
	order by employee_id
$$, $$ values ('[{"method": "Cash", "amount_cents": 0}]'::jsonb), ('[{"method": "Cash", "amount_cents": -500}]'::jsonb) $$,
	'a $0 run and a negative run read one part equal to their total');
select is((select payout_parts from public.pay_runs_with_payout_parts where id = '70000000-0000-4000-8000-00000000000d'),
	null, 'a run that isn''t paid has no parts');


-- As admin: Edit payout --------------------------------------------------------------------------

create temporary table pgtap_before_edit on commit drop as
select paid_at, (select sum(amount_cents) from public.pay_run_lines where pay_run_id = pay_runs.id) as frozen_total
from public.pay_runs where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c');

select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c'),
	jsonb_build_array(public.pgtap_part('Cash', 14000), public.pgtap_part('e-Transfer', 40000)), public.pgtap_period_end() + 1)),
	null, 'a single-method run is edited into a split');
select results_eq($$
	select status, payout_method, paid_on, payout_parts from public.pay_runs_with_payout_parts
	where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c')
$$, $$ values ('paid'::text, null::text, public.pgtap_period_end() + 1,
	'[{"method": "Cash", "amount_cents": 14000}, {"method": "e-Transfer", "amount_cents": 40000}]'::jsonb) $$,
	'single to split: still paid, new date, no single method, parts in order');

select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c'),
	jsonb_build_array(public.pgtap_part('Interac', 10000), public.pgtap_part('Cash', 14000), public.pgtap_part('e-Transfer', 30000)),
	public.pgtap_period_end() + 1)),
	null, 'a split is edited into another split');
select is((select payout_parts from public.pay_runs_with_payout_parts where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c')),
	'[{"method": "Interac", "amount_cents": 10000}, {"method": "Cash", "amount_cents": 14000}, {"method": "e-Transfer", "amount_cents": 30000}]'::jsonb,
	'split to split: the whole payout is replaced, parts in the new order');

select is(public.pgtap_refusal(format('select public.update_pay_run_payout(%L, %L, %L)',
	public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c'), '  Cash ', public.pgtap_period_end())), null,
	'a split is edited back to one method');
select results_eq($$
	select run.status, run.payout_method, run.paid_on, parts.payout_parts, run.split_parts is null
	from public.pay_runs run join public.pay_runs_with_payout_parts parts on parts.id = run.id
	where run.id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c')
$$, $$ values ('paid'::text, 'Cash'::text, public.pgtap_period_end(), '[{"method": "Cash", "amount_cents": 54000}]'::jsonb, true) $$,
	'split to single: still paid, one trimmed method, one part holding the total');

select results_eq($$
	select paid_at = (select paid_at from pgtap_before_edit),
		(select sum(amount_cents) from public.pay_run_lines where pay_run_id = pay_runs.id) = (select frozen_total from pgtap_before_edit)
	from public.pay_runs where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c')
$$, $$ values (true, true) $$, 'three edits later the run''s paid_at and frozen amounts are unchanged');

create temporary table pgtap_before_bad_edits on commit drop as
select public.pgtap_snapshot(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')) as snapshot;

select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 54000)), public.pgtap_period_end())),
	'split_too_few_parts', 'Edit payout refuses one part');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_period_end())),
	'method_required', 'Edit payout refuses a blank method');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 54000), public.pgtap_part('e-Transfer', 0)), public.pgtap_period_end())),
	'split_part_not_positive', 'Edit payout refuses a $0 part');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part(' cash', 34000)), public.pgtap_period_end())),
	'split_duplicate_method', 'Edit payout refuses a repeated method');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 30000)), public.pgtap_period_end())),
	'split_sum_mismatch', 'Edit payout refuses parts that don''t add up to the stored total');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), null)),
	'paid_on_required', 'Edit payout refuses a missing paid date');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_today() + 1)),
	'paid_on_future', 'Edit payout refuses a future paid date');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a'),
	jsonb_build_array(public.pgtap_part('Cash', 20000), public.pgtap_part('e-Transfer', 34000)), public.pgtap_period_end() - 1)),
	'paid_on_before_period_end', 'Edit payout refuses a paid date before the period ends');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000001b'),
	jsonb_build_array(public.pgtap_part('Cash', 100), public.pgtap_part('e-Transfer', 100)), public.pgtap_period_end())),
	'split_not_allowed', 'Edit payout can''t split a paid $0 run');
select is(public.pgtap_refusal(public.pgtap_edit_split(public.pgtap_run_id('e0000000-0000-4000-8000-00000000001c'),
	jsonb_build_array(public.pgtap_part('Cash', 100), public.pgtap_part('e-Transfer', 100)), public.pgtap_period_end())),
	'split_not_allowed', 'Edit payout can''t split a paid negative run');
select is(public.pgtap_refusal(public.pgtap_edit_split('70000000-0000-4000-8000-00000000000d',
	jsonb_build_array(public.pgtap_part('Cash', 100), public.pgtap_part('e-Transfer', 100)), public.pgtap_period_end())),
	'not_paid', 'Edit payout refuses a run that isn''t paid');
select is(public.pgtap_refusal(public.pgtap_edit_split('70000000-0000-4000-8000-0000000000ff',
	jsonb_build_array(public.pgtap_part('Cash', 100), public.pgtap_part('e-Transfer', 100)), public.pgtap_period_end())),
	'run_not_found', 'Edit payout refuses an unknown run');
select is(public.pgtap_snapshot(public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')),
	(select snapshot from pgtap_before_bad_edits), 'after every refused edit the split run is exactly as it was');

reset role;


-- The stored shape (as postgres) -------------------------------------------------------------------

select throws_ok($$
	update public.pay_runs set payout_method = 'Cash'
	where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000a')
$$, '23514', null, 'a run can''t hold both a single method and parts');
select throws_ok($$
	update public.pay_runs set split_parts = '[{"method": "Cash", "amount_cents": 54000}]'::jsonb, payout_method = null
	where id = public.pgtap_run_id('e0000000-0000-4000-8000-00000000000c')
$$, '23514', null, 'a run can''t hold fewer than two parts');


-- As Cleaners ------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select results_eq($$
	select payout_method, payout_parts, total_cents::bigint from public.pay_runs_employee_view
$$, $$ values (null::text, '[{"method": "Cash", "amount_cents": 20000}, {"method": "e-Transfer", "amount_cents": 34000}]'::jsonb, 54000::bigint) $$,
	'a Cleaner reads her split run''s parts in order, and only her own run');
select is_empty($$ select id from public.pay_runs_with_payout_parts $$, 'a Cleaner reads no run from the admin reader');

set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-00000000010c", "role": "authenticated"}';

select results_eq($$
	select payout_method, payout_parts from public.pay_runs_employee_view
$$, $$ values ('Cash'::text, '[{"method": "Cash", "amount_cents": 54000}]'::jsonb) $$,
	'a teammate reads her own single-method run as one part, never the split one');

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok($$ select id from public.pay_runs_with_payout_parts $$, '42501', null, 'anon can''t read the admin reader');

reset role;

select * from finish();

rollback;
