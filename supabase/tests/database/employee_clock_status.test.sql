-- employee_clock drives appointments.status from the crew's clocks, asserted as the calling role.
--
-- The RPC is the single writer of clock-driven status: after every clock write it recomputes the
-- appointment's status from its non-archived assignments, and it refuses to clock on an
-- appointment an admin has completed or cancelled. These tests pin the returned outcome and the
-- resulting row, never how the recompute is written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(55);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test'),
	('a0000000-0000-4000-8000-000000000003', 'pgtap.employee.b@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, address, e_transfer_email) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false, '1 A St', 'a@pay.test'),
	('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000003', 'Employee B', true, false, '2 B St', 'b@pay.test');

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'pgTAP Client');

insert into public.client_locations (id, client_id, label, address) values
	('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b0000000-0000-4000-8000-000000000001', 'pgTAP Job', 4500, false);

insert into public.appointments (
	id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time,
	price_override_cents, billed_price_cents, status, status_before_cancel
) values
	-- d1: single crew (A).
	('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00', 9000, 9000, 'scheduled', null),
	-- d2: two crew (A and B).
	('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-02', '09:00', '11:00', 9000, 9000, 'scheduled', null),
	-- d3: A plus an archived, never-clocked assignment for B.
	('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-03', '09:00', '11:00', 9000, 9000, 'scheduled', null),
	-- d4: completed by an admin, A assigned and never clocked.
	('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-04', '09:00', '11:00', 9000, 9000, 'completed', null),
	-- d5: cancelled by an admin while scheduled, A assigned and never clocked.
	('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-05', '09:00', '11:00', 9000, 9000, 'cancelled', 'scheduled'),
	-- d6: admin set it back to scheduled while A is clocked in; B has not clocked yet.
	('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-06', '09:00', '11:00', 9000, 9000, 'scheduled', null),
	-- d7: assignments in every pre-clocked state, for the existing outcomes.
	('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-07', '09:00', '11:00', 9000, 9000, 'in_progress', null),
	-- d9: A assigned, plus a never-clocked row for B whose is_archived is NULL (the column is nullable).
	('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-09', '09:00', '11:00', 9000, 9000, 'scheduled', null);

insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	('f0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-00000000000b', false, null, null),
	('f0000000-0000-4000-8000-000000000031', 'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000032', 'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-00000000000b', true, null, null),
	('f0000000-0000-4000-8000-000000000041', 'd0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000051', 'd0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000061', 'd0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000000a', false, '2026-10-06 09:00+00', null),
	('f0000000-0000-4000-8000-000000000062', 'd0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-00000000000b', false, null, null),
	-- d7: A clocked in, B clocked out, plus a never-clocked row that belongs to B only.
	('f0000000-0000-4000-8000-000000000071', 'd0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-00000000000a', false, '2026-10-07 09:00+00', null),
	('f0000000-0000-4000-8000-000000000072', 'd0000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-00000000000b', false, '2026-10-07 09:00+00', '2026-10-07 10:00+00'),
	('f0000000-0000-4000-8000-000000000091', 'd0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-00000000000a', false, null, null),
	('f0000000-0000-4000-8000-000000000092', 'd0000000-0000-4000-8000-000000000009', 'e0000000-0000-4000-8000-00000000000b', null, null, null);


-- Helpers --------------------------------------------------------------------------------------

-- Calls the RPC as one employee without leaving the authenticated role: only the JWT claims
-- change between calls. Invoker rights, so the RPC sees exactly what PostgREST would give it.
create function public.pgtap_clock(user_id uuid, assignment uuid, action text) returns text
	language plpgsql
	as $$
begin
	perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
	return public.employee_clock(assignment, action);
end;
$$;

-- Reads the rows the RPC wrote. Definer rights because employees cannot read the base tables,
-- and reading through a view would make the assertion depend on the view.
create function public.pgtap_appointment(appointment uuid) returns text
	language sql security definer
	as $$
	select status || '/' || coalesce(status_before_cancel, 'null')
	from public.appointments
	where id = appointment;
$$;

create function public.pgtap_clocks(assignment uuid) returns text
	language sql security definer
	as $$
	select case when clocked_in_at is null then 'null' else 'set' end
		|| '/' || case when clocked_out_at is null then 'null' else 'set' end
	from public.appointment_employees
	where id = assignment;
$$;


-- Definer rights and grants match 20260917 ----------------------------------------------------

select is_definer('public', 'employee_clock', array['uuid', 'text'],
	'employee_clock is SECURITY DEFINER');
select function_privs_are('public', 'employee_clock', array['uuid', 'text'], 'anon', array['EXECUTE'],
	'anon keeps EXECUTE on employee_clock');
select function_privs_are('public', 'employee_clock', array['uuid', 'text'], 'authenticated', array['EXECUTE'],
	'authenticated has EXECUTE on employee_clock');
select function_privs_are('public', 'employee_clock', array['uuid', 'text'], 'service_role', array['EXECUTE'],
	'service_role has EXECUTE on employee_clock');


set local role authenticated;


-- d1: single crew ------------------------------------------------------------------------------

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000011', 'in'),
	'clocked', 'single crew: A clocks in');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000001'),
	'in_progress/null', 'single crew: in progress once A clocked in');

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000011', 'out'),
	'clocked', 'single crew: A clocks out');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000001'),
	'completed/null', 'single crew: completed once A clocked out');


-- d2: two crew ---------------------------------------------------------------------------------

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000021', 'in'),
	'clocked', 'two crew: A clocks in');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000002'),
	'in_progress/null', 'two crew: in progress once A clocked in');

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000021', 'out'),
	'clocked', 'two crew: A clocks out');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000002'),
	'in_progress/null', 'two crew: still in progress after A clocked out, B has not clocked in');

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000022', 'in'),
	'clocked', 'two crew: B clocks in after A left');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000002'),
	'in_progress/null', 'two crew: in progress while B is clocked in');

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000022', 'out'),
	'clocked', 'two crew: B clocks out');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000002'),
	'completed/null', 'two crew: completed once everyone assigned clocked out');


-- d3: an archived assignment is ignored by the recompute ---------------------------------------

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000031', 'in'),
	'clocked', 'archived crew: A clocks in');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000031', 'out'),
	'clocked', 'archived crew: A clocks out');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000003'),
	'completed/null', 'archived crew: the never-clocked archived assignment does not block completed');
select is(public.pgtap_clocks('f0000000-0000-4000-8000-000000000032'),
	'null/null', 'archived crew: the archived assignment is untouched');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000032', 'in'),
	'not_assigned', 'archived crew: a removed crew member clocking on their archived row is not_assigned');
select is(public.pgtap_clocks('f0000000-0000-4000-8000-000000000032'),
	'null/null', 'archived crew: the refused clock wrote nothing on the archived row');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000003'),
	'completed/null', 'archived crew: the refused clock moved no status');


-- d9: a NULL is_archived counts as an active assignment ----------------------------------------

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000091', 'in'),
	'clocked', 'null is_archived: A clocks in');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000091', 'out'),
	'clocked', 'null is_archived: A clocks out');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000009'),
	'in_progress/null', 'null is_archived: B''s never-clocked row still counts, so not completed');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000092', 'in'),
	'clocked', 'null is_archived: B can clock in on the NULL row');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000092', 'out'),
	'clocked', 'null is_archived: B clocks out');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000009'),
	'completed/null', 'null is_archived: completed once the NULL row has clocked out too');


-- d4: a completed appointment refuses clocks ---------------------------------------------------

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000041', 'in'),
	'appointment_completed', 'completed: clock in is refused');
select is(public.pgtap_clocks('f0000000-0000-4000-8000-000000000041'),
	'null/null', 'completed: clock in wrote nothing');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000041', 'out'),
	'appointment_completed', 'completed: clock out is refused');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000004'),
	'completed/null', 'completed: status unchanged');


-- d5: a cancelled appointment refuses clocks ---------------------------------------------------

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000051', 'in'),
	'appointment_cancelled', 'cancelled: clock in is refused');
select is(public.pgtap_clocks('f0000000-0000-4000-8000-000000000051'),
	'null/null', 'cancelled: clock in wrote nothing');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000051', 'out'),
	'appointment_cancelled', 'cancelled: clock out is refused');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000005'),
	'cancelled/scheduled', 'cancelled: status and status_before_cancel unchanged');


-- d6: an admin-set scheduled is recomputed by the next clock write -----------------------------

select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000006'),
	'scheduled/null', 'admin reset: starts scheduled with A clocked in');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000062', 'in'),
	'clocked', 'admin reset: B clocks in');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000006'),
	'in_progress/null', 'admin reset: recomputed to in progress');


-- d7: existing outcomes are unchanged ----------------------------------------------------------

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000072', 'in'),
	'not_assigned', 'another employee''s assignment is not_assigned');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000072', 'out'),
	'not_assigned', 'another employee''s assignment is not_assigned on clock out too');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000071', 'in'),
	'already_clocked_in', 'clocking in twice is already_clocked_in');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000072', 'out'),
	'already_clocked_out', 'clocking out twice is already_clocked_out');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000072', 'in'),
	'clock_in_after_clock_out', 'clocking in after clocking out is clock_in_after_clock_out');
select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000022', 'in'),
	'appointment_completed', 'a finished crew member cannot reopen a completed appointment: the closed check wins');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000007'),
	'in_progress/null', 'refused clocks leave the status alone');
select is(public.pgtap_clocks('f0000000-0000-4000-8000-000000000071'),
	'set/null', 'refused clocks leave A''s clocks alone');

select throws_ok(
	$$ select public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000071', 'sideways') $$,
	'P0001', 'unknown clock action: sideways', 'an unknown clock action still raises');

-- clock_out_before_clock_in needs a never-clocked own assignment: d2's rows are used up, so a
-- fresh one is added as postgres.
reset role;
insert into public.appointments (
	id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time,
	price_override_cents, billed_price_cents
) values
	('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
	 'c1000000-0000-4000-8000-000000000001', '2026-10-08', '09:00', '11:00', 9000, 9000);
insert into public.appointment_employees (id, appointment_id, employee_id) values
	('f0000000-0000-4000-8000-000000000081', 'd0000000-0000-4000-8000-000000000008', 'e0000000-0000-4000-8000-00000000000a');
set local role authenticated;

select is(public.pgtap_clock('a0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000081', 'out'),
	'clock_out_before_clock_in', 'clocking out first is clock_out_before_clock_in');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000008'),
	'scheduled/null', 'a refused clock out leaves a scheduled appointment scheduled');
select is(public.pgtap_clocks('f0000000-0000-4000-8000-000000000081'),
	'null/null', 'a refused clock out writes nothing');


-- As anon: no session matches no assignment ----------------------------------------------------

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(public.employee_clock('f0000000-0000-4000-8000-000000000081', 'in'),
	'not_assigned', 'anon is not assigned to anything');

reset role;

select is(public.pgtap_clocks('f0000000-0000-4000-8000-000000000081'),
	'null/null', 'anon wrote nothing');
select is(public.pgtap_appointment('d0000000-0000-4000-8000-000000000008'),
	'scheduled/null', 'anon moved no status');

select * from finish();

rollback;
