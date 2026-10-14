-- Payroll settings, Pay period math, the pay tables and the pay view, asserted as admin, employee
-- and anon (20261014230000).
--
-- The pay view mirrors the Time Sheet rules in src/lib/time-sheets/session-view.ts: grace = the
-- visit's Toronto wall-clock scheduled end + 1 h, Odd duration under 0.5x or over 1.5x the scheduled
-- length unless an acknowledgement matches the current clocks. These tests pin view rows and
-- refusals, never how the view is written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql. Shift
-- dates are a few days from today, so they are always on or after the Payroll start (2026-10-05)
-- and always past or before their grace end, whatever the time of day.

begin;

create extension if not exists pgtap with schema extensions;

select plan(77);


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

-- Thirty minutes ago on the Toronto wall clock: a visit that ended inside its grace hour.
create function public.pgtap_recent_end() returns timestamp
	language sql stable
	as $$
	select (now() - interval '30 minutes') at time zone 'America/Toronto';
$$;

-- Admin, employee A and anon, as PostgREST would set them up.
create function public.pgtap_admin_claims() returns text
	language sql immutable
	as $$ select '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}'; $$;

create function public.pgtap_employee_claims() returns text
	language sql immutable
	as $$ select '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}'; $$;


-- Settings and Pay period math -----------------------------------------------------------------

select results_eq($$ select pay_period_anchor, payroll_start from public.payroll_settings() $$,
	$$ values ('2026-10-05'::date, '2026-10-05'::date) $$,
	'the Pay period anchor and the Payroll start are both 2026-10-05');

select is(public.pay_period_start('2026-10-05'), '2026-10-05'::date, 'the anchor starts its own period');
select is(public.pay_period_start('2026-10-18'), '2026-10-05'::date, 'the period''s last Sunday maps to its start');
select is(public.pay_period_start('2026-10-19'), '2026-10-19'::date, 'the next Monday starts the next period');
select is(public.pay_period_start('2026-11-01'), '2026-10-19'::date, 'Nov 1 is the last day of the Oct 19 period');
select is(public.pay_period_start('2026-10-04'), '2026-09-21'::date, 'a date before the anchor maps to an earlier period');

select ok(public.pay_period_has_ended('2026-09-21'), 'a period that ended weeks ago has ended');
select ok(not public.pay_period_has_ended((now() at time zone 'America/Toronto')::date),
	'the period containing today''s Business date has not ended');


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test'),
	('a0000000-0000-4000-8000-000000000003', 'pgtap.employee.b@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, default_payout_method) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false, 'e-Transfer'),
	('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000003', 'Employee B', true, false, 'Cash');

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'Smith Residence');

insert into public.client_locations (id, client_id, label, address) values
	('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

-- J1 has no Job pay premium (the default); J2 adds $2.00/h.
insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b0000000-0000-4000-8000-000000000001', 'Standard Clean', 4500, false);
insert into public.jobs (id, name, hourly_rate_cents, is_archived, pay_premium_cents) values
	('b0000000-0000-4000-8000-000000000002', 'Deep Clean', 6000, false, 200);

insert into public.pay_rates (id, employee_id, hourly_rate_cents, effective_from) values
	('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 2300, '2026-10-05');

insert into public.appointments (
	id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, is_archived
) values
	-- v1: yesterday 09:00-12:05 (185 min), J1.
	('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(1), '09:00', '12:05', 'scheduled', false),
	-- v2: yesterday 13:00-15:00, J2 (premium).
	('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(1), '13:00', '15:00', 'scheduled', false),
	-- v3: two days ago 09:00-11:00: A clocked in, never out.
	('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(2), '09:00', '11:00', 'scheduled', false),
	-- v4: two days ago 13:00-15:00: A never clocked.
	('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(2), '13:00', '15:00', 'scheduled', false),
	-- v5: two days ago, cancelled, A never clocked.
	('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(2), '16:00', '17:00', 'cancelled', false),
	-- v6: tomorrow, A never clocked.
	('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(-1), '09:00', '11:00', 'scheduled', false),
	-- v7 and v8: ended thirty minutes ago, inside the grace hour. A is clocked in on v7, never on v8.
	('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_recent_end()::date, '00:00', public.pgtap_recent_end()::time, 'scheduled', false),
	('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_recent_end()::date, '00:00', public.pgtap_recent_end()::time, 'scheduled', false),
	-- v9: three days ago 09:00-11:00 (120 min): A clocked only 30 min, an Odd duration.
	('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(3), '09:00', '11:00', 'scheduled', false),
	-- v10: yesterday, A's session is Removed.
	('d0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(1), '16:00', '17:00', 'scheduled', false),
	-- v11: yesterday, archived appointment.
	('d0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(1), '17:00', '18:00', 'scheduled', true),
	-- v12: the day before the Payroll start.
	('d0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-04', '09:00', '11:00', 'scheduled', false),
	-- v14: yesterday 09:00-10:00: A's clock-in mistyped, 1,000,000 minutes before her clock-out.
	('d0000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(1), '09:00', '10:00', 'scheduled', false),
	-- v13: yesterday 09:00-10:00: B, who has no Pay rate.
	('d0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(1), '09:00', '10:00', 'scheduled', false);

insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(1, '09:00'), public.pgtap_at(1, '12:05')),
	('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(1, '13:00'), public.pgtap_at(1, '15:00')),
	('f0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(2, '09:00'), null),
	('f0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-00000000000a', false,
	 now() - interval '2 hours', null),
	('f0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(3, '09:00'), public.pgtap_at(3, '09:30')),
	('f0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-00000000000a', true,
	 public.pgtap_at(1, '16:00'), public.pgtap_at(1, '17:00')),
	('f0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(1, '17:00'), public.pgtap_at(1, '18:00')),
	('f0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-00000000000a', false,
	 '2026-10-04 09:00 America/Toronto', '2026-10-04 11:00 America/Toronto'),
	('f0000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-00000000000b', false,
	 public.pgtap_at(1, '09:00'), public.pgtap_at(1, '10:00')),
	('f0000000-0000-4000-8000-000000000014', 'd0000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(1, '10:00') - interval '1000000 minutes', public.pgtap_at(1, '10:00'));


-- Table rules (as postgres) --------------------------------------------------------------------

select throws_ok($$
	insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from)
	values ('e0000000-0000-4000-8000-00000000000a', 2500, '2026-10-05')
$$, '23505', null, 'two live Pay rates for one Cleaner can''t share an effective date');
select lives_ok($$
	insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from, is_archived)
	values ('e0000000-0000-4000-8000-00000000000a', 2500, '2026-10-05', true)
$$, 'an archived Pay rate may share the date of a live one');
select throws_ok($$
	insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from)
	values ('e0000000-0000-4000-8000-00000000000a', 0, '2026-10-06')
$$, '23514', null, 'a Pay rate must be above zero');

select throws_ok($$ update public.jobs set pay_premium_cents = -1 where id = 'b0000000-0000-4000-8000-000000000001' $$,
	'23514', null, 'a Job pay premium can''t be negative');
select is((select pay_premium_cents from public.jobs where id = 'b0000000-0000-4000-8000-000000000001'), 0,
	'a Job pay premium is 0 unless set');

select throws_ok($$
	insert into public.pay_runs (employee_id, period_start, kind, status, created_by)
	values ('e0000000-0000-4000-8000-00000000000a', '2026-10-06', 'regular', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, '23514', null, 'a Pay run must start on a Pay period start');
select throws_ok($$
	insert into public.pay_runs (employee_id, period_start, kind, status, created_by)
	values ('e0000000-0000-4000-8000-00000000000a', '2026-09-21', 'regular', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, '23514', null, 'a Pay run can''t be for a period before the Payroll start');
select throws_ok($$
	insert into public.pay_runs (employee_id, period_start, kind, status, created_by)
	values ('e0000000-0000-4000-8000-00000000000a', '2026-10-05', 'bonus', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, '23514', null, 'a Pay run is regular or off_cycle');

-- A's regular run for this period is paid and claims v2's session with frozen values that differ
-- from the live ones; B's regular run is finalized and claims v13's session.
insert into public.pay_runs (id, employee_id, period_start, kind, status, finalized_at, paid_on, payout_method, paid_at, created_by) values
	('70000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', public.pay_period_start(public.pgtap_day(1)),
	 'regular', 'paid', now(), public.pgtap_day(0), 'e-Transfer', now(), 'a0000000-0000-4000-8000-000000000001'),
	('70000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000b', public.pay_period_start(public.pgtap_day(1)),
	 'regular', 'finalized', now(), null, null, null, 'a0000000-0000-4000-8000-000000000001');

insert into public.pay_run_lines (pay_run_id, appointment_employee_id, scheduled_date, client_name, job_name, minutes, rate_cents, amount_cents) values
	('70000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', '2026-10-06', 'Frozen Client', 'Frozen Job', 90, 2000, 3000);
insert into public.pay_run_lines (pay_run_id, appointment_employee_id) values
	('70000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000013');

select throws_ok($$
	insert into public.pay_runs (employee_id, period_start, kind, status, created_by)
	values ('e0000000-0000-4000-8000-00000000000a', public.pay_period_start(public.pgtap_day(1)), 'regular', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, '23505', null, 'a Cleaner has one regular run per Pay period');
select lives_ok($$
	insert into public.pay_runs (id, employee_id, period_start, kind, status, created_by)
	values ('70000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-00000000000b', public.pay_period_start(public.pgtap_day(1)), 'off_cycle', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, 'an off-cycle run can start beside a finalized, unpaid regular run');
select throws_ok($$
	insert into public.pay_runs (employee_id, period_start, kind, status, created_by)
	values ('e0000000-0000-4000-8000-00000000000b', public.pay_period_start(public.pgtap_day(1)), 'off_cycle', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, '23505', null, 'a Cleaner has one unpaid off-cycle run per Pay period at a time');
select throws_ok($$
	insert into public.pay_runs (employee_id, period_start, kind, status, created_by)
	values ('e0000000-0000-4000-8000-00000000000b', '2026-10-19', 'off_cycle', 'finalized', 'a0000000-0000-4000-8000-000000000001'),
		('e0000000-0000-4000-8000-00000000000b', '2026-10-19', 'off_cycle', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, '23505', null, 'two unpaid off-cycle runs in one period are refused whatever their status');
select lives_ok($$
	insert into public.pay_runs (id, employee_id, period_start, kind, status, created_by)
	values ('70000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000000a', public.pay_period_start(public.pgtap_day(1)), 'off_cycle', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, 'an off-cycle run can sit beside a paid regular run');

select throws_ok($$
	insert into public.pay_run_lines (pay_run_id, appointment_employee_id)
	values ('70000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002')
$$, '23505', null, 'a session already claimed can''t be claimed again');
select throws_ok($$ delete from public.appointment_employees where id = 'f0000000-0000-4000-8000-000000000013' $$,
	'23503', null, 'a claimed session can''t be deleted');

select throws_ok($$
	insert into public.pay_adjustments (pay_run_id, amount_cents, reason, created_by)
	values ('70000000-0000-4000-8000-000000000003', 0, 'Gas', 'a0000000-0000-4000-8000-000000000001')
$$, '23514', null, 'an Adjustment can''t be $0');
select throws_ok($$
	insert into public.pay_adjustments (pay_run_id, amount_cents, reason, created_by)
	values ('70000000-0000-4000-8000-000000000003', 500, '   ', 'a0000000-0000-4000-8000-000000000001')
$$, '23514', null, 'an Adjustment needs a reason');
select lives_ok($$
	insert into public.pay_adjustments (pay_run_id, amount_cents, reason, created_by)
	values ('70000000-0000-4000-8000-000000000003', -500, 'Overpaid last run', 'a0000000-0000-4000-8000-000000000001')
$$, 'a negative Adjustment with a reason is kept');


-- The pay view, as admin -----------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select set_eq($$ select appointment_employee_id from public.pay_period_sessions $$,
	$$ values
		('f0000000-0000-4000-8000-000000000001'::uuid), ('f0000000-0000-4000-8000-000000000002'), ('f0000000-0000-4000-8000-000000000003'),
		('f0000000-0000-4000-8000-000000000004'), ('f0000000-0000-4000-8000-000000000005'), ('f0000000-0000-4000-8000-000000000006'),
		('f0000000-0000-4000-8000-000000000007'), ('f0000000-0000-4000-8000-000000000008'), ('f0000000-0000-4000-8000-000000000009'),
		('f0000000-0000-4000-8000-000000000013'), ('f0000000-0000-4000-8000-000000000014')
	$$, 'Removed sessions, archived appointments and shifts before the Payroll start never appear');

-- A closed session, with no premium.
select results_eq($$
	select employee_id, period_start, appointment_id, scheduled_date, client_name, job_name, appointment_status, state
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001'
$$, $$ values ('e0000000-0000-4000-8000-00000000000a'::uuid, public.pay_period_start(public.pgtap_day(1)),
	'd0000000-0000-4000-8000-000000000001'::uuid, public.pgtap_day(1), 'Smith Residence', 'Standard Clean', 'completed', 'closed') $$,
	'a closed session reports its Cleaner, period, visit and names');
select results_eq($$
	select clocked_minutes, base_rate_cents, pay_premium_cents, effective_rate_cents, amount_cents, has_no_rate, is_payable
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001'
$$, $$ values (185, 2300, 0, 2300, 7092, false, true) $$,
	'185 min at $23.00/h pays $70.92');
select results_eq($$
	select is_open_shift, is_missing_clock, is_odd_duration, pay_run_id
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001'
$$, $$ values (false, false, false, null::uuid) $$, 'a normal closed session has no flag and no claim');

-- A clock mistyped years long reports its amount instead of overflowing the query.
select results_eq($$
	select clocked_minutes, amount_cents
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000014'
$$, $$ values (1000000, 38333333) $$, '1,000,000 min at $23.00/h is $383,333.33, with no int overflow');

-- An Open shift past its grace hour.
select results_eq($$
	select state, is_open_shift, is_missing_clock, clocked_minutes, amount_cents, has_no_rate
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000003'
$$, $$ values ('open', true, false, null::integer, null::integer, false) $$,
	'an Open shift past grace is flagged and counts no minutes');

-- Missing clock, and a cancelled visit that never has one.
select results_eq($$
	select state, is_open_shift, is_missing_clock, is_payable
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000004'
$$, $$ values ('not_clocked', false, true, true) $$, 'a session never clocked past grace is a Missing clock');
select results_eq($$
	select state, is_missing_clock, is_payable, appointment_status
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000005'
$$, $$ values ('not_clocked', false, false, 'cancelled') $$,
	'a cancelled visit has no Missing clock and is not payable');

-- Before and inside the grace hour.
select results_eq($$
	select state, is_open_shift, is_missing_clock
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000006'
$$, $$ values ('upcoming', false, false) $$, 'a visit not yet held is upcoming, with no flag');
select results_eq($$
	select state, is_open_shift, clocked_minutes
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000007'
$$, $$ values ('in_progress', false, null::integer) $$,
	'a session still open within an hour of the scheduled end is in progress, not an Open shift');
select results_eq($$
	select state, is_missing_clock
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000008'
$$, $$ values ('upcoming', false) $$,
	'a session never clocked within an hour of the scheduled end is not yet a Missing clock');

-- Odd duration, then acknowledged, then the clocks change.
select results_eq($$
	select state, is_odd_duration, clocked_minutes, amount_cents
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000009'
$$, $$ values ('closed', true, 30, 1150) $$, '30 min clocked on a 2 h visit is an Odd duration that still pays');

reset role;
insert into public.odd_duration_acknowledgements (appointment_employee_id, acknowledged_by, acknowledged_by_name, clock_in, clock_out, note)
values ('f0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'Pat Admin',
	public.pgtap_at(3, '09:00'), public.pgtap_at(3, '09:30'), 'Left early, agreed');
set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select is((select is_odd_duration from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000009'),
	false, 'a matching acknowledgement clears the Odd duration');

reset role;
update public.appointment_employees set clocked_out_at = public.pgtap_at(3, '09:31')
where id = 'f0000000-0000-4000-8000-000000000009';
set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select is((select is_odd_duration from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000009'),
	true, 'the Odd duration comes back when the clocks change');

-- A paid claim: frozen values, not v2's live ones (J2, 120 min).
select results_eq($$
	select scheduled_date, client_name, job_name, clocked_minutes, effective_rate_cents, amount_cents, has_no_rate,
		pay_run_id, pay_run_kind, pay_run_status
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000002'
$$, $$ values ('2026-10-06'::date, 'Frozen Client', 'Frozen Job', 90, 2000, 3000, false,
	'70000000-0000-4000-8000-000000000001'::uuid, 'regular', 'paid') $$,
	'a paid session reports the frozen values of its claim');

-- No Pay rate, on a finalized claim.
select results_eq($$
	select clocked_minutes, base_rate_cents, effective_rate_cents, amount_cents, has_no_rate, pay_run_id, pay_run_kind, pay_run_status
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000013'
$$, $$ values (60, null::integer, null::integer, null::integer, true,
	'70000000-0000-4000-8000-000000000002'::uuid, 'regular', 'finalized') $$,
	'a closed session with no Pay rate has no amount and has_no_rate, and shows its finalized claim');

-- Effective rate = Pay rate + Job pay premium, on an unpaid session.
reset role;
update public.appointments set job_id = 'b0000000-0000-4000-8000-000000000002' where id = 'd0000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select results_eq($$
	select job_name, base_rate_cents, pay_premium_cents, effective_rate_cents, amount_cents
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001'
$$, $$ values ('Deep Clean', 2300, 200, 2500, 7708) $$, 'the Job pay premium folds into the rate: 185 min at $25.00/h');

reset role;
update public.appointments set job_id = 'b0000000-0000-4000-8000-000000000001' where id = 'd0000000-0000-4000-8000-000000000001';


-- Pay rates: back-dating and archiving, as admin through RLS ------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_admin_claims(), true);

select lives_ok($$
	insert into public.pay_rates (id, employee_id, hourly_rate_cents, effective_from)
	values ('90000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000a', 2600, public.pgtap_day(1))
$$, 'an admin can add a Pay rate');

select results_eq($$
	select appointment_employee_id, base_rate_cents, amount_cents
	from public.pay_period_sessions
	where appointment_employee_id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000009', 'f0000000-0000-4000-8000-000000000002')
	order by appointment_employee_id
$$, $$ values
	('f0000000-0000-4000-8000-000000000001'::uuid, 2600, 8017),
	('f0000000-0000-4000-8000-000000000002'::uuid, null::integer, 3000),
	('f0000000-0000-4000-8000-000000000009'::uuid, 2300, 1188)
$$, 'a new rate applies from its date on: unpaid later shifts change, earlier ones and paid ones don''t');

select lives_ok($$
	update public.pay_rates set effective_from = public.pgtap_day(3) where id = '90000000-0000-4000-8000-000000000002'
$$, 'an admin can back-date a Pay rate');
select is((select base_rate_cents from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000009'),
	2600, 'back-dating a rate changes the view for unpaid shifts it now covers');

select lives_ok($$
	update public.pay_rates set is_archived = true where id = '90000000-0000-4000-8000-000000000002'
$$, 'an admin can archive a Pay rate');
select is((select base_rate_cents from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000009'),
	2300, 'archiving a rate falls back to the earlier one');

select lives_ok($$
	update public.pay_rates set is_archived = true where id = '90000000-0000-4000-8000-000000000001'
$$, 'an admin can archive the only live Pay rate');
select results_eq($$
	select base_rate_cents, effective_rate_cents, amount_cents, has_no_rate
	from public.pay_period_sessions where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001'
$$, $$ values (null::integer, null::integer, null::integer, true) $$,
	'with every rate archived the shift has no rate and no amount');

select results_eq($$
	select count(*) from public.pay_rates where employee_id = 'e0000000-0000-4000-8000-00000000000a'
$$, $$ values (3::bigint) $$, 'an admin can read Pay rates');
select lives_ok($$
	delete from public.pay_rates where id = '90000000-0000-4000-8000-000000000002'
$$, 'an admin can delete a Pay rate');
select results_eq($$
	select count(*) from public.pay_rates where id = '90000000-0000-4000-8000-000000000002'
$$, $$ values (0::bigint) $$, 'the deleted Pay rate is gone');

-- Admins read the pay tables, but write runs, claims and Adjustments only through functions.
select results_eq($$ select count(*) from public.pay_runs $$, $$ values (4::bigint) $$, 'an admin can read Pay runs');
select results_eq($$ select count(*) from public.pay_run_lines $$, $$ values (2::bigint) $$, 'an admin can read claims');
select results_eq($$ select count(*) from public.pay_adjustments $$, $$ values (1::bigint) $$, 'an admin can read Adjustments');
select throws_ok($$
	insert into public.pay_runs (employee_id, period_start, kind, status, created_by)
	values ('e0000000-0000-4000-8000-00000000000b', '2026-10-19', 'regular', 'draft', 'a0000000-0000-4000-8000-000000000001')
$$, '42501', null, 'an admin can''t insert a Pay run directly');
select throws_ok($$ delete from public.pay_run_lines $$, '42501', null, 'an admin can''t delete a claim directly');
select throws_ok($$ update public.pay_adjustments set amount_cents = 1 $$, '42501', null, 'an admin can''t edit an Adjustment directly');


-- As an employee -------------------------------------------------------------------------------

reset role;
set local role authenticated;
select set_config('request.jwt.claims', public.pgtap_employee_claims(), true);

select is_empty($$ select 1 from public.pay_period_sessions $$, 'an employee reads no rows of the pay view');
select is_empty($$ select 1 from public.pay_rates $$, 'an employee reads no Pay rates');
select is_empty($$ select 1 from public.pay_runs $$, 'an employee reads no Pay runs');
select is_empty($$ select 1 from public.pay_run_lines $$, 'an employee reads no claims');
select is_empty($$ select 1 from public.pay_adjustments $$, 'an employee reads no Adjustments');
select throws_ok($$
	insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from)
	values ('e0000000-0000-4000-8000-00000000000a', 9900, '2026-10-12')
$$, '42501', null, 'an employee can''t add a Pay rate');
select throws_ok($$
	insert into public.pay_adjustments (pay_run_id, amount_cents, reason, created_by)
	values ('70000000-0000-4000-8000-000000000003', 500, 'Tip', 'a0000000-0000-4000-8000-000000000002')
$$, '42501', null, 'an employee can''t add an Adjustment');

select ok((select bool_and(not (to_jsonb(j) ? 'pay_premium_cents')) from public.jobs_employee_view j),
	'jobs_employee_view doesn''t carry the Job pay premium');
select ok((select bool_and(not (to_jsonb(e) ? 'default_payout_method')) from public.employees_employee_view e),
	'employees_employee_view doesn''t carry the default Payout method');
select is_empty($$ select 1 from public.jobs where pay_premium_cents is not null $$,
	'an employee reads no jobs, so no Job pay premium');

reset role;

-- No view other than the admin-only pay view exposes either admin-only column.
select is_empty($$
	select c.table_name, c.column_name
	from information_schema.columns c
	join information_schema.views v on v.table_schema = c.table_schema and v.table_name = c.table_name
	where c.table_schema = 'public'
		and c.column_name in ('pay_premium_cents', 'default_payout_method')
		and c.table_name <> 'pay_period_sessions'
$$, 'no other view exposes the Job pay premium or the default Payout method');


-- As anon --------------------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok($$ select 1 from public.pay_period_sessions $$, '42501', null, 'anon can''t read the pay view');
select throws_ok($$ select 1 from public.pay_rates $$, '42501', null, 'anon can''t read Pay rates');
select throws_ok($$ select 1 from public.pay_runs $$, '42501', null, 'anon can''t read Pay runs');
select throws_ok($$ select 1 from public.pay_run_lines $$, '42501', null, 'anon can''t read claims');
select throws_ok($$ select 1 from public.pay_adjustments $$, '42501', null, 'anon can''t read Adjustments');

reset role;


-- Frozen columns are all set or all empty (as postgres) ----------------------------------------

select throws_ok($$
	update public.pay_run_lines set amount_cents = 100 where appointment_employee_id = 'f0000000-0000-4000-8000-000000000013'
$$, '23514', null, 'a claim''s frozen columns are filled all at once');

select * from finish();

rollback;
