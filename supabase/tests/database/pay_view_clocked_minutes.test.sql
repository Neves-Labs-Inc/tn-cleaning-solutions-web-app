-- Clocked time drops seconds in the pay view (20261016120000): minutes are the whole-minute
-- difference of the clocks truncated to the minute, never negative. CONTEXT.md "Clocked time".
--
-- Pins private.clocked_minutes and what pay_period_sessions reports for clocks holding seconds,
-- never how the view is written. Fixtures are built here and rolled back; shift dates are a few
-- days back, so they are on or after the Payroll start (2026-10-05) and past their grace end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);


-- Helpers (as postgres) ------------------------------------------------------------------------

-- An instant on a Business date days_ago days back, at a Toronto wall-clock time.
create function public.pgtap_at(days_ago integer, wall_time time) returns timestamptz
	language sql stable
	as $$
	select (((now() at time zone 'America/Toronto')::date - days_ago) + wall_time) at time zone 'America/Toronto';
$$;

create function public.pgtap_day(days_ago integer) returns date
	language sql stable
	as $$
	select (now() at time zone 'America/Toronto')::date - days_ago;
$$;

create function public.pgtap_admin_claims() returns text
	language sql immutable
	as $$ select '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}'; $$;


-- clocked_minutes ------------------------------------------------------------------------------

set local time zone 'UTC';
select is(private.clocked_minutes('2026-10-15 09:00:40.123456-04', '2026-10-15 12:30:10-04'), 210,
	'9:00:40 to 12:30:10 is 210 min under TimeZone UTC');

set local time zone 'America/Toronto';
select is(private.clocked_minutes('2026-10-15 09:00:40.123456-04', '2026-10-15 12:30:10-04'), 210,
	'9:00:40 to 12:30:10 is 210 min under TimeZone America/Toronto');

select is(private.clocked_minutes('2026-10-15 09:00:50-04', '2026-10-15 09:01:10-04'), 1,
	'seconds crossing a minute boundary count that minute');
select is(private.clocked_minutes('2026-10-15 12:30:00-04', '2026-10-15 09:00:00-04'), 0,
	'a clock-out before the clock-in is 0 min');
select is(private.clocked_minutes('2026-10-15 09:00:00-04', null), null::integer,
	'a missing clock-out counts no minutes');


-- Fixtures (as postgres) -----------------------------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false);

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'Smith Residence');

insert into public.client_locations (id, client_id, label, address) values
	('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b0000000-0000-4000-8000-000000000001', 'Standard Clean', 4500, false);

insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from) values
	('e0000000-0000-4000-8000-00000000000a', 2300, '2026-10-05');

insert into public.appointments (
	id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, is_archived
) values
	-- v1: yesterday 09:00-12:30.
	('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(1), '09:00', '12:30', 'scheduled', false),
	-- v2: two days ago 09:00-11:00 (120 min): exactly half, 60 min, is not an Odd duration.
	('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(2), '09:00', '11:00', 'scheduled', false);

insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(1, '09:00') + interval '40 seconds', public.pgtap_at(1, '12:30') + interval '10 seconds'),
	-- Full timestamps differ by 59 min 20 s, which the seconds-sensitive rule floored to an odd 59.
	('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(2, '09:00') + interval '50 seconds', public.pgtap_at(2, '10:00') + interval '10 seconds');


-- The pay view, as admin -----------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select results_eq($$
	select clocked_minutes, amount_cents
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001'
$$, $$ values (210, 8050) $$,
	'clocks of 9:00:40 to 12:30:10 count 210 min, paying $80.50 at $23.00/h');

select results_eq($$
	select clocked_minutes, is_odd_duration
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000002'
$$, $$ values (60, false) $$,
	'9:00:50 to 10:00:10 on a 120-min visit counts 60 min, so it is not an Odd duration');

reset role;
set local time zone 'UTC';
set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select results_eq($$
	select clocked_minutes, amount_cents
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001'
$$, $$ values (210, 8050) $$,
	'the view counts the same minutes under TimeZone UTC');

reset role;

select ok(not has_function_privilege('anon', 'private.clocked_minutes(timestamptz, timestamptz)', 'execute')
	or not has_schema_privilege('anon', 'private', 'usage'),
	'anon can''t reach clocked_minutes');

select * from finish();

rollback;
