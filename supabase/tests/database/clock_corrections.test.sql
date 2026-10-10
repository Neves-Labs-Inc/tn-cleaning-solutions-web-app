-- Clock corrections and Odd duration acknowledgements, asserted as admin, employee and anon.
--
-- correct_session_clocks is the one write path for an admin clock change; acknowledge_odd_duration
-- records that an admin looked at an odd length and found it fine (20261010120000). These tests pin
-- the refusal codes (DETAIL), the resulting clocks and status, and the audit rows, never how the
-- functions are written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql. Dates are
-- relative to today because the functions compare against now().

begin;

create extension if not exists pgtap with schema extensions;

select plan(96);


-- Helpers (as postgres) ------------------------------------------------------------------------

-- An instant on a Business date days_ago days back, at an Eastern wall-clock time.
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

-- The HINT a statement raised, or null.
create function public.pgtap_hint(statement text) returns text
	language plpgsql
	as $$
declare
	raised_hint text;
begin
	execute statement;
	return null;
exception when others then
	get stacked diagnostics raised_hint = pg_exception_hint;
	return raised_hint;
end;
$$;

-- Definer-rights readers, so assertions don't depend on the caller's RLS.
create function public.pgtap_status(appointment uuid) returns text
	language sql security definer
	as $$ select status from public.appointments where id = appointment; $$;

create function public.pgtap_clocks(assignment uuid) returns table (clocked_in_at timestamptz, clocked_out_at timestamptz)
	language sql security definer
	as $$ select clocked_in_at, clocked_out_at from public.appointment_employees where id = assignment; $$;

create function public.pgtap_correction_count(assignment uuid) returns bigint
	language sql security definer
	as $$ select count(*) from public.clock_corrections where appointment_employee_id = assignment; $$;

create function public.pgtap_acknowledgement_count(assignment uuid) returns bigint
	language sql security definer
	as $$ select count(*) from public.odd_duration_acknowledgements where appointment_employee_id = assignment; $$;


-- Schema ---------------------------------------------------------------------------------------

select has_table('public', 'clock_corrections', 'clock_corrections exists');
select has_table('public', 'odd_duration_acknowledgements', 'odd_duration_acknowledgements exists');

select fk_ok('public', 'clock_corrections', 'appointment_employee_id', 'public', 'appointment_employees', 'id',
	'a correction belongs to a session');
select fk_ok('public', 'odd_duration_acknowledgements', 'appointment_employee_id', 'public', 'appointment_employees', 'id',
	'an acknowledgement belongs to a session');
select is((select confdeltype::text from pg_constraint where conrelid = 'public.clock_corrections'::regclass and contype = 'f'),
	'r', 'deleting a corrected session is restricted');
select is((select confdeltype::text from pg_constraint where conrelid = 'public.odd_duration_acknowledgements'::regclass and contype = 'f'),
	'r', 'deleting an acknowledged session is restricted');

select has_index('public', 'clock_corrections', 'clock_corrections_appointment_employee_id_idx', 'appointment_employee_id',
	'clock_corrections is indexed by session');
select has_index('public', 'odd_duration_acknowledgements', 'odd_duration_acknowledgements_appointment_employee_id_idx',
	'appointment_employee_id', 'odd_duration_acknowledgements is indexed by session');

select ok((select relrowsecurity from pg_class where oid = 'public.clock_corrections'::regclass),
	'clock_corrections has RLS on');
select ok((select relrowsecurity from pg_class where oid = 'public.odd_duration_acknowledgements'::regclass),
	'odd_duration_acknowledgements has RLS on');
select policies_are('public', 'clock_corrections', array['Admin select clock_corrections'],
	'clock_corrections has only the admin select policy');
select policies_are('public', 'odd_duration_acknowledgements', array['Admin select odd_duration_acknowledgements'],
	'odd_duration_acknowledgements has only the admin select policy');
select policy_cmd_is('public', 'clock_corrections', 'Admin select clock_corrections', 'select',
	'the clock_corrections policy is select only');
select policy_cmd_is('public', 'odd_duration_acknowledgements', 'Admin select odd_duration_acknowledgements', 'select',
	'the odd_duration_acknowledgements policy is select only');

select is_definer('public', 'correct_session_clocks', array['uuid', 'timestamp with time zone', 'timestamp with time zone', 'text'],
	'correct_session_clocks is SECURITY DEFINER');
select is_definer('public', 'acknowledge_odd_duration', array['uuid', 'timestamp with time zone', 'timestamp with time zone', 'text'],
	'acknowledge_odd_duration is SECURITY DEFINER');
select is((select proconfig from pg_proc where proname = 'correct_session_clocks'),
	array['search_path=""'], 'correct_session_clocks runs with an empty search_path');
select is((select proconfig from pg_proc where proname = 'acknowledge_odd_duration'),
	array['search_path=""'], 'acknowledge_odd_duration runs with an empty search_path');


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pat.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test'),
	('a0000000-0000-4000-8000-000000000003', 'pgtap.employee.b@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, address, e_transfer_email) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false, '1 A St', 'a@pay.test'),
	('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000003', 'Employee B', true, false, '2 B St', 'b@pay.test');

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'Smith Residence');

insert into public.client_locations (id, client_id, label, address) values
	('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b0000000-0000-4000-8000-000000000001', 'pgTAP Job', 4500, false);

insert into public.appointments (
	id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time,
	price_override_cents, status, is_archived
) values
	-- v1: A never clocked, ten days ago: validation, completing, auditing, clearing.
	('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(10), '09:00', '11:00', 9000, 'scheduled', false),
	-- v2: Manual completion, A never clocked (flag set below).
	('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(9), '09:00', '11:00', 9000, 'scheduled', false),
	-- v3: cancelled, A never clocked.
	('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(8), '09:00', '11:00', 9000, 'cancelled', false),
	-- v4: A's assignment is archived.
	('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(8), '12:00', '14:00', 9000, 'scheduled', false),
	-- v5: the appointment is archived.
	('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(8), '15:00', '16:00', 9000, 'scheduled', true),
	-- Seven days ago, for overlap: v6 A closed 09:00-11:00 and B closed 10:00-12:00; v7 A never
	-- clocked (the candidate); v8 cancelled, A closed 12:00-13:00; v9 A's archived assignment, closed
	-- 13:00-14:00; v10 archived visit, A closed 14:00-15:00; v11 A open since 15:00.
	('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(7), '09:00', '11:00', 9000, 'scheduled', false),
	('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(7), '11:00', '12:00', 9000, 'scheduled', false),
	('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(7), '12:00', '13:00', 9000, 'cancelled', false),
	('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(7), '13:00', '14:00', 9000, 'scheduled', false),
	('d0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(7), '14:00', '15:00', 9000, 'scheduled', true),
	('d0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(7), '15:00', '16:00', 9000, 'scheduled', false),
	-- v12: tomorrow, A never clocked: a clock-in alone is fine before the visit has ended.
	('d0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(-1), '09:00', '11:00', 9000, 'scheduled', false),
	-- v13: six days ago, A open since 09:00: editing an Open shift's clock-in.
	('d0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', public.pgtap_day(6), '09:00', '11:00', 9000, 'scheduled', false);

insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	('f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-00000000000a', true, null, null),
	('f0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(7, '09:00'), public.pgtap_at(7, '11:00')),
	('f0000000-0000-4000-8000-000000000016', 'd0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000000b', false,
	 public.pgtap_at(7, '10:00'), public.pgtap_at(7, '12:00')),
	('f0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(7, '12:00'), public.pgtap_at(7, '13:00')),
	('f0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-00000000000a', true,
	 public.pgtap_at(7, '13:00'), public.pgtap_at(7, '14:00')),
	('f0000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(7, '14:00'), public.pgtap_at(7, '15:00')),
	('f0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(7, '15:00'), null),
	('f0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-00000000000a', false,
	 public.pgtap_at(6, '09:00'), null);

-- Admin writes made after the crew exists, since adding crew re-derives the status.
update public.appointments set manually_completed = true where id = 'd0000000-0000-4000-8000-000000000002';


-- Append-only and RESTRICT (as postgres, the most privileged role) -----------------------------

insert into public.clock_corrections (appointment_employee_id, corrected_by, corrected_by_name, reason) values
	('f0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'Pat Admin', 'fixture');
insert into public.odd_duration_acknowledgements (appointment_employee_id, acknowledged_by, acknowledged_by_name, clock_in, clock_out, note) values
	('f0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'Pat Admin',
	 public.pgtap_at(7, '12:00'), public.pgtap_at(7, '13:00'), 'fixture');

select throws_ok($$ update public.clock_corrections set reason = 'changed' $$, 'P0001', null,
	'a correction can''t be updated, even by postgres');
select throws_ok($$ delete from public.clock_corrections $$, 'P0001', null,
	'a correction can''t be deleted, even by postgres');
select throws_ok($$ update public.odd_duration_acknowledgements set note = 'changed' $$, 'P0001', null,
	'an acknowledgement can''t be updated, even by postgres');
select throws_ok($$ delete from public.odd_duration_acknowledgements $$, 'P0001', null,
	'an acknowledgement can''t be deleted, even by postgres');
select throws_ok($$ delete from public.appointment_employees where id = 'f0000000-0000-4000-8000-000000000008' $$, '23503', null,
	'a session with a correction or acknowledgement can''t be deleted');
select throws_ok($$
	insert into public.odd_duration_acknowledgements (appointment_employee_id, acknowledged_by, acknowledged_by_name, clock_in, clock_out, note)
	values ('f0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'Pat Admin', now(), now(), '   ')
$$, '23514', null, 'an acknowledgement needs a non-blank note');


-- correct_session_clocks as admin --------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "email": "pat.admin@example.test", "app_metadata": {"role": "admin"}, "user_metadata": {"full_name": "Pat Admin"}}';

-- Session refusals.
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000000ff', public.pgtap_at(10, '09:00'), public.pgtap_at(10, '11:00'), null)
$$), 'session_not_found', 'a missing session is session_not_found');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000004', public.pgtap_at(8, '12:00'), public.pgtap_at(8, '14:00'), null)
$$), 'session_archived', 'an archived assignment is session_archived');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000005', public.pgtap_at(8, '15:00'), public.pgtap_at(8, '16:00'), null)
$$), 'session_not_found', 'a session on an archived visit is session_not_found');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000003', public.pgtap_at(8, '09:00'), public.pgtap_at(8, '11:00'), null)
$$), 'visit_cancelled', 'a session on a cancelled visit is visit_cancelled');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000003', null, null, null)
$$), 'visit_cancelled', 'clearing a session on a cancelled visit is visit_cancelled');

-- Clock refusals, in order.
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', null, public.pgtap_at(10, '11:00'), null)
$$), 'clock_in_required', 'a clock-out without a clock-in is clock_in_required');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', null, now() + interval '1 hour', null)
$$), 'clock_in_required', 'clock_in_required comes before clock_out_future');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', now() + interval '1 hour', now() + interval '2 hours', null)
$$), 'clock_in_future', 'a future clock-in is clock_in_future, before clock_out_future');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '09:00'), now() + interval '1 hour', null)
$$), 'clock_out_future', 'a future clock-out is clock_out_future');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '09:00'), public.pgtap_at(10, '09:00'), null)
$$), 'clock_out_before_clock_in', 'a clock-out equal to the clock-in is clock_out_before_clock_in');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '11:00'), public.pgtap_at(10, '09:00'), null)
$$), 'clock_out_before_clock_in', 'a clock-out before the clock-in is clock_out_before_clock_in');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '09:00'), null, null)
$$), 'clock_out_required', 'a clock-in alone on a never-clocked session over an hour past its end is clock_out_required');
select is(public.pgtap_correction_count('f0000000-0000-4000-8000-000000000001'),
	0::bigint, 'refusals write no correction');
select results_eq($$ select * from public.pgtap_clocks('f0000000-0000-4000-8000-000000000001') $$,
	$$ values (null::timestamptz, null::timestamptz) $$, 'refusals leave the clocks alone');

-- Entering clocks on a never-clocked session completes the visit and audits it.
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '09:00'), public.pgtap_at(10, '11:00'), '  Forgot to clock in  ')
$$, 'an admin enters both clocks on a never-clocked session');
select results_eq($$ select * from public.pgtap_clocks('f0000000-0000-4000-8000-000000000001') $$,
	$$ values (public.pgtap_at(10, '09:00'), public.pgtap_at(10, '11:00')) $$, 'both clocks are written');
select is(public.pgtap_status('d0000000-0000-4000-8000-000000000001'), 'completed', 'the visit is completed');
select results_eq($$
	select corrected_by, corrected_by_name, old_clock_in, old_clock_out, new_clock_in, new_clock_out, reason,
		corrected_at = now()
	from public.clock_corrections where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001'
$$, $$
	values ('a0000000-0000-4000-8000-000000000001'::uuid, 'Pat Admin'::text, null::timestamptz, null::timestamptz,
		public.pgtap_at(10, '09:00'), public.pgtap_at(10, '11:00'), 'Forgot to clock in'::text, true)
$$, 'exactly one correction records who, their name, old and new clocks and the trimmed reason');

-- The same values again change nothing.
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '09:00'), public.pgtap_at(10, '11:00'), 'again')
$$, 'saving the same clocks again is fine');
select is(public.pgtap_correction_count('f0000000-0000-4000-8000-000000000001'),
	1::bigint, 'a no-op writes no correction');

-- A blank reason is stored as null.
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '09:00'), public.pgtap_at(10, '10:30'), '   ')
$$, 'an admin moves the clock-out');
select results_eq($$
	select old_clock_out, new_clock_out, reason from public.clock_corrections
	where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001' and new_clock_out = public.pgtap_at(10, '10:30')
$$, $$
	values (public.pgtap_at(10, '11:00'), public.pgtap_at(10, '10:30'), null::text)
$$, 'the correction keeps the old clock-out, and a blank reason is null');

-- Clearing is allowed, audited and re-derives the status.
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', null, null, 'Wrong visit')
$$, 'an admin clears both clocks');
select results_eq($$ select * from public.pgtap_clocks('f0000000-0000-4000-8000-000000000001') $$,
	$$ values (null::timestamptz, null::timestamptz) $$, 'clearing empties both clocks');
select is(public.pgtap_status('d0000000-0000-4000-8000-000000000001'), 'scheduled', 'a cleared visit is scheduled again');
select results_eq($$
	select old_clock_in, old_clock_out, new_clock_in, new_clock_out, reason from public.clock_corrections
	where appointment_employee_id = 'f0000000-0000-4000-8000-000000000001' and new_clock_in is null
$$, $$
	values (public.pgtap_at(10, '09:00'), public.pgtap_at(10, '10:30'), null::timestamptz, null::timestamptz, 'Wrong visit'::text)
$$, 'the clear is audited with the old clocks');
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', null, null, null)
$$, 'clearing a cleared session is fine');
select is(public.pgtap_correction_count('f0000000-0000-4000-8000-000000000001'),
	3::bigint, 'clearing a cleared session writes nothing');

-- Manual completion: clocks may be entered and the visit stays completed.
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000002', public.pgtap_at(9, '09:00'), public.pgtap_at(9, '11:00'), null)
$$, 'an admin enters clocks on a manually completed visit');
select is(public.pgtap_status('d0000000-0000-4000-8000-000000000002'), 'completed', 'the manually completed visit stays completed');
select is(public.pgtap_correction_count('f0000000-0000-4000-8000-000000000002'), 1::bigint, 'and it is audited');

-- A clock-in alone is fine before the visit has ended, and on an Open shift.
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000012', now() - interval '1 hour', null, null)
$$, 'a clock-in alone on a visit that hasn''t ended yet opens a shift');
select is(public.pgtap_status('d0000000-0000-4000-8000-000000000012'), 'in_progress', 'that visit is in progress');
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000013', public.pgtap_at(6, '09:15'), null, null)
$$, 'an admin moves an Open shift''s clock-in without closing it');
select results_eq($$ select * from public.pgtap_clocks('f0000000-0000-4000-8000-000000000013') $$,
	$$ values (public.pgtap_at(6, '09:15'), null::timestamptz) $$, 'the shift stays open with the new clock-in');

-- Overlap: only the Cleaner's closed, live sessions on live, uncancelled visits count.
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '10:00'), public.pgtap_at(7, '12:00'), null)
$$), 'overlap', 'clashing with another closed session of the Cleaner is overlap');
select is(public.pgtap_hint($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '10:00'), public.pgtap_at(7, '12:00'), null)
$$), 'f0000000-0000-4000-8000-000000000006', 'the overlap HINT is the clashing assignment id');
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '11:00'), public.pgtap_at(7, '12:00'), null)
$$, 'touching another session is fine, and another Cleaner''s session never clashes');
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '12:15'), public.pgtap_at(7, '12:45'), null)
$$, 'a session on a cancelled visit never clashes');
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '13:15'), public.pgtap_at(7, '13:45'), null)
$$, 'an archived assignment never clashes');
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '14:15'), public.pgtap_at(7, '14:45'), null)
$$, 'a session on an archived visit never clashes');
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '15:15'), public.pgtap_at(7, '15:45'), null)
$$, 'an Open shift never clashes');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '08:00'), null, null)
$$), 'overlap', 'without a clock-out the candidate runs until now, so it clashes');
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000006', public.pgtap_at(7, '09:00'), public.pgtap_at(7, '10:59'), null)
$$, 'a session never clashes with itself');


-- acknowledge_odd_duration as admin ------------------------------------------------------------

select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-0000000000ff', public.pgtap_at(7, '09:00'), public.pgtap_at(7, '10:59'), 'Long clean')
$$), 'session_not_found', 'acknowledging a missing session is session_not_found');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000009', public.pgtap_at(7, '13:00'), public.pgtap_at(7, '14:00'), 'Long clean')
$$), 'session_archived', 'acknowledging an archived assignment is session_archived');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000010', public.pgtap_at(7, '14:00'), public.pgtap_at(7, '15:00'), 'Long clean')
$$), 'session_not_found', 'acknowledging a session on an archived visit is session_not_found');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000008', public.pgtap_at(7, '12:00'), public.pgtap_at(7, '13:00'), 'Long clean')
$$), 'visit_cancelled', 'acknowledging a session on a cancelled visit is visit_cancelled');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000011', public.pgtap_at(7, '15:00'), null, 'Long clean')
$$), 'session_open', 'acknowledging an Open shift is session_open');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000001', null, null, 'Long clean')
$$), 'session_open', 'acknowledging a never-clocked session is session_open');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000006', public.pgtap_at(7, '09:00'), public.pgtap_at(7, '11:00'), 'Long clean')
$$), 'clocks_changed', 'acknowledging clocks that have since changed is clocks_changed');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000006', public.pgtap_at(7, '09:00'), public.pgtap_at(7, '10:59'), '   ')
$$), 'note_required', 'a blank note is note_required');
select is(public.pgtap_acknowledgement_count('f0000000-0000-4000-8000-000000000006'),
	0::bigint, 'refused acknowledgements write nothing');

select lives_ok($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000006', public.pgtap_at(7, '09:00'), public.pgtap_at(7, '10:59'), 'Deep clean, took the whole morning')
$$, 'an admin acknowledges a closed session');
select results_eq($$
	select acknowledged_by, acknowledged_by_name, clock_in, clock_out, note, acknowledged_at = now()
	from public.odd_duration_acknowledgements where appointment_employee_id = 'f0000000-0000-4000-8000-000000000006'
$$, $$
	values ('a0000000-0000-4000-8000-000000000001'::uuid, 'Pat Admin'::text, public.pgtap_at(7, '09:00'), public.pgtap_at(7, '10:59'),
		'Deep clean, took the whole morning'::text, true)
$$, 'the acknowledgement snapshots who, their name, the clocks and the note');

-- With no full name in the token, the name snapshot is the email.
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "email": "pat.admin@example.test", "app_metadata": {"role": "admin"}}';
select lives_ok($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000007', public.pgtap_at(7, '15:15'), public.pgtap_at(7, '15:50'), null)
$$, 'an admin without a full name corrects a session');
select is((select corrected_by_name from public.clock_corrections
	where appointment_employee_id = 'f0000000-0000-4000-8000-000000000007' and new_clock_out = public.pgtap_at(7, '15:50')),
	'pat.admin@example.test', 'the name snapshot falls back to the email');

select isnt_empty($$ select 1 from public.clock_corrections $$, 'an admin can read corrections');
select isnt_empty($$ select 1 from public.odd_duration_acknowledgements $$, 'an admin can read acknowledgements');
select throws_ok($$
	insert into public.clock_corrections (appointment_employee_id, corrected_by, corrected_by_name)
	values ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Pat Admin')
$$, '42501', null, 'even an admin can''t write a correction directly');


-- As an employee -------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated", "email": "pgtap.employee.a@example.test"}';

select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '09:00'), public.pgtap_at(10, '11:00'), null)
$$), 'not_admin', 'an employee can''t correct clocks, even their own');
select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-0000000000ff', null, null, null)
$$), 'not_admin', 'not_admin comes before session_not_found');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000006', public.pgtap_at(7, '09:00'), public.pgtap_at(7, '10:59'), 'Fine')
$$), 'not_admin', 'an employee can''t acknowledge');
select is_empty($$ select 1 from public.clock_corrections $$, 'an employee reads no corrections');
select is_empty($$ select 1 from public.odd_duration_acknowledgements $$, 'an employee reads no acknowledgements');


-- As anon --------------------------------------------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(public.pgtap_refusal($$
	select public.correct_session_clocks('f0000000-0000-4000-8000-000000000001', public.pgtap_at(10, '09:00'), public.pgtap_at(10, '11:00'), null)
$$), 'not_admin', 'anon can''t correct clocks');
select is(public.pgtap_refusal($$
	select public.acknowledge_odd_duration('f0000000-0000-4000-8000-000000000006', public.pgtap_at(7, '09:00'), public.pgtap_at(7, '10:59'), 'Fine')
$$), 'not_admin', 'anon can''t acknowledge');
select throws_ok($$ select 1 from public.clock_corrections $$, '42501', null, 'anon can''t select corrections');
select throws_ok($$ select 1 from public.odd_duration_acknowledgements $$, '42501', null, 'anon can''t select acknowledgements');

reset role;

select results_eq($$ select * from public.pgtap_clocks('f0000000-0000-4000-8000-000000000001') $$,
	$$ values (null::timestamptz, null::timestamptz) $$, 'the employee and anon wrote no clocks');
select is(public.pgtap_correction_count('f0000000-0000-4000-8000-000000000001'),
	3::bigint, 'the employee and anon wrote no corrections');
select is(public.pgtap_acknowledgement_count('f0000000-0000-4000-8000-000000000006'),
	1::bigint, 'the employee and anon wrote no acknowledgements');

select * from finish();

rollback;
