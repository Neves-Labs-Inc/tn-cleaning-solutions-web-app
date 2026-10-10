-- Appointment status is derived in the database from the clocks and the Manual completion flag.
--
-- Drives every writer the triggers must cover: employee_clock as an authenticated Cleaner, and
-- direct UPDATE / INSERT / DELETE as postgres for the admin paths (clock override, crew changes,
-- Mark complete, Cancel, Restore). Asserts only the resulting appointments.status and
-- manually_completed, never how the recompute is written. Fixtures are rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(66);


-- Fixtures (as postgres) -----------------------------------------------------------------------

insert into auth.users (id, email) values
	('a2000000-0000-4000-8000-000000000001', 'pgtap.lifecycle.a@example.test'),
	('a2000000-0000-4000-8000-000000000002', 'pgtap.lifecycle.b@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, address, e_transfer_email) values
	('e2000000-0000-4000-8000-00000000000a', 'a2000000-0000-4000-8000-000000000001', 'Lifecycle A', true, false, '1 A St', 'a@pay.test'),
	('e2000000-0000-4000-8000-00000000000b', 'a2000000-0000-4000-8000-000000000002', 'Lifecycle B', true, false, '2 B St', 'b@pay.test');

insert into public.clients (id, name) values
	('c2000000-0000-4000-8000-000000000001', 'pgTAP Lifecycle Client');

insert into public.client_locations (id, client_id, label, address) values
	('c2100000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Home', '10 Client Rd');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b2000000-0000-4000-8000-000000000001', 'pgTAP Lifecycle Job', 4500, false);


-- Helpers --------------------------------------------------------------------------------------

create function public.pgtap_lifecycle_appointment(appointment uuid, status text) returns void
	language sql
	as $$
	insert into public.appointments (
		id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, notes
	) values (
		appointment, 'c2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
		'c2100000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00', status, ''
	);
$$;

-- Calls the RPC as one employee; only the JWT claims change between calls.
create function public.pgtap_lifecycle_clock(user_id uuid, assignment uuid, action text) returns text
	language plpgsql
	as $$
begin
	perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
	return public.employee_clock(assignment, action);
end;
$$;

-- "<status>/<manual|clocks>". Definer rights so it reads the row the same way as either role.
create function public.pgtap_lifecycle_state(appointment uuid) returns text
	language sql security definer
	as $$
	select status || '/' || case when manually_completed then 'manual' else 'clocks' end
	from public.appointments
	where id = appointment;
$$;

create function public.pgtap_lifecycle_clocks(assignment uuid) returns text
	language sql security definer
	as $$
	select case when clocked_in_at is null then 'null' else 'set' end
		|| '/' || case when clocked_out_at is null then 'null' else 'set' end
	from public.appointment_employees
	where id = assignment;
$$;


-- Schema ---------------------------------------------------------------------------------------

select hasnt_column('public', 'appointments', 'status_before_cancel', 'status_before_cancel is dropped');
select has_column('public', 'appointments', 'manually_completed', 'manually_completed exists');
select col_not_null('public', 'appointments', 'manually_completed', 'manually_completed is not null');
select col_default_is('public', 'appointments', 'manually_completed', 'false', 'manually_completed defaults to false');


-- L1: clocks drive the status, a no-show never holds it open ------------------------------------

select public.pgtap_lifecycle_appointment('d2000000-0000-4000-8000-000000000001', 'scheduled');
insert into public.appointment_employees (id, appointment_id, employee_id) values
	('f2000000-0000-4000-8000-000000000011', 'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-00000000000a'),
	('f2000000-0000-4000-8000-000000000012', 'd2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-00000000000b');

select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000001'),
	'scheduled/clocks', 'L1: crew assigned, nobody clocked in: scheduled');

set local role authenticated;

select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011', 'in'),
	'clocked', 'L1: A clocks in');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000001'),
	'in_progress/clocks', 'L1: in progress once A clocked in');
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000011', 'out'),
	'clocked', 'L1: A clocks out');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000001'),
	'completed/clocks', 'L1: completed once everyone who clocked in has clocked out, though B never clocked in');
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000012', 'in'),
	'clocked', 'L1: B can clock in late on a completion derived from the clocks');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000001'),
	'in_progress/clocks', 'L1: the late clock-in reopens it to in progress');
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000012', 'out'),
	'clocked', 'L1: B clocks out');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000001'),
	'completed/clocks', 'L1: completed again once B clocked out');

reset role;

-- The admin clock override is a plain UPDATE on appointment_employees.
update public.appointment_employees set clocked_out_at = null
	where id = 'f2000000-0000-4000-8000-000000000012';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000001'),
	'in_progress/clocks', 'L1: clearing B''s clock out (admin override) reopens it to in progress');

update public.appointment_employees set clocked_in_at = null, clocked_out_at = null
	where appointment_id = 'd2000000-0000-4000-8000-000000000001';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000001'),
	'scheduled/clocks', 'L1: clearing every clock (admin override) goes back to scheduled');


-- L2: crew changes recompute the status --------------------------------------------------------

select public.pgtap_lifecycle_appointment('d2000000-0000-4000-8000-000000000002', 'scheduled');
insert into public.appointment_employees (id, appointment_id, employee_id, clocked_in_at, clocked_out_at) values
	('f2000000-0000-4000-8000-000000000021', 'd2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-00000000000a', '2026-10-01 09:00+00', '2026-10-01 10:00+00');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000002'),
	'completed/clocks', 'L2: adding a crew row that already clocked in and out completes it');

insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at) values
	('f2000000-0000-4000-8000-000000000022', 'd2000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-00000000000b', null, '2026-10-01 09:30+00');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000002'),
	'in_progress/clocks', 'L2: adding an open shift (is_archived NULL counts as active) makes it in progress');

update public.appointment_employees set is_archived = true where id = 'f2000000-0000-4000-8000-000000000022';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000002'),
	'completed/clocks', 'L2: archiving the open shift recomputes to completed');

update public.appointment_employees set is_archived = false where id = 'f2000000-0000-4000-8000-000000000022';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000002'),
	'in_progress/clocks', 'L2: unarchiving it recomputes to in progress');

delete from public.appointment_employees where id = 'f2000000-0000-4000-8000-000000000022';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000002'),
	'completed/clocks', 'L2: deleting the open shift recomputes to completed');

delete from public.appointment_employees where id = 'f2000000-0000-4000-8000-000000000021';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000002'),
	'scheduled/clocks', 'L2: with no crew left it is scheduled');


-- L3: Manual completion wins over the clocks and the clock-out escape ---------------------------

select public.pgtap_lifecycle_appointment('d2000000-0000-4000-8000-000000000003', 'scheduled');
insert into public.appointment_employees (id, appointment_id, employee_id, clocked_in_at) values
	('f2000000-0000-4000-8000-000000000031', 'd2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-00000000000a', '2026-10-01 09:00+00'),
	('f2000000-0000-4000-8000-000000000032', 'd2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-00000000000b', '2026-10-01 09:00+00');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000003'),
	'in_progress/clocks', 'L3: starts in progress with A and B clocked in');

update public.appointments set manually_completed = true where id = 'd2000000-0000-4000-8000-000000000003';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000003'),
	'completed/manual', 'L3: Mark complete makes it completed while both are still clocked in');

set local role authenticated;

select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000031', 'out'),
	'clocked', 'L3: A can still clock out of a manually completed appointment');
select is(public.pgtap_lifecycle_clocks('f2000000-0000-4000-8000-000000000031'),
	'set/set', 'L3: A''s clock out was written');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000003'),
	'completed/manual', 'L3: still completed after the clock out');
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000031', 'out'),
	'appointment_completed', 'L3: clocking out twice on a completed appointment is still refused as completed');

reset role;

update public.appointment_employees set clocked_in_at = '2026-10-01 08:30+00'
	where id = 'f2000000-0000-4000-8000-000000000032';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000003'),
	'completed/manual', 'L3: a clock override does not undo a Manual completion');

update public.appointments set manually_completed = false where id = 'd2000000-0000-4000-8000-000000000003';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000003'),
	'in_progress/clocks', 'L3: Undo complete recalculates from the clocks (B still clocked in)');

set local role authenticated;
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000032', 'out'),
	'clocked', 'L3: B clocks out');
reset role;
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000003'),
	'completed/clocks', 'L3: completed from the clocks once B clocked out');


-- L4: Manual completion with nobody clocked in, and Undo ----------------------------------------

select public.pgtap_lifecycle_appointment('d2000000-0000-4000-8000-000000000004', 'scheduled');
insert into public.appointment_employees (id, appointment_id, employee_id) values
	('f2000000-0000-4000-8000-000000000041', 'd2000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-00000000000a');

update public.appointments set manually_completed = true where id = 'd2000000-0000-4000-8000-000000000004';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000004'),
	'completed/manual', 'L4: Mark complete with nobody clocked in');

set local role authenticated;
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000041', 'in'),
	'appointment_completed', 'L4: clock in on a manually completed appointment is refused');
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000041', 'out'),
	'appointment_completed', 'L4: clock out without an open shift on a completed appointment is refused');
reset role;

update public.appointments set status = 'scheduled' where id = 'd2000000-0000-4000-8000-000000000004';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000004'),
	'completed/manual', 'L4: a status write on a manually completed row stays completed');

update public.appointments set manually_completed = false where id = 'd2000000-0000-4000-8000-000000000004';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000004'),
	'scheduled/clocks', 'L4: Undo complete goes back to scheduled');

update public.appointments set manually_completed = false, notes = 'edited' where id = 'd2000000-0000-4000-8000-000000000004';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000004'),
	'scheduled/clocks', 'L4: an unrelated edit leaves the status alone');


-- L5: Cancel holds against clocks and the flag; clock out still works ---------------------------

select public.pgtap_lifecycle_appointment('d2000000-0000-4000-8000-000000000005', 'scheduled');
insert into public.appointment_employees (id, appointment_id, employee_id, clocked_in_at) values
	('f2000000-0000-4000-8000-000000000051', 'd2000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-00000000000a', '2026-10-01 09:00+00');
insert into public.appointment_employees (id, appointment_id, employee_id) values
	('f2000000-0000-4000-8000-000000000052', 'd2000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-00000000000b');

update public.appointments set status = 'cancelled' where id = 'd2000000-0000-4000-8000-000000000005';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000005'),
	'cancelled/clocks', 'L5: writing cancelled is kept while A is clocked in');

set local role authenticated;
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000052', 'in'),
	'appointment_cancelled', 'L5: clock in on a cancelled appointment is refused');
select is(public.pgtap_lifecycle_clocks('f2000000-0000-4000-8000-000000000052'),
	'null/null', 'L5: the refused clock in wrote nothing');
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000052', 'out'),
	'appointment_cancelled', 'L5: clock out without an open shift on a cancelled appointment is refused');
select is(public.pgtap_lifecycle_clock('a2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000051', 'out'),
	'clocked', 'L5: A can still clock out of a cancelled appointment');
select is(public.pgtap_lifecycle_clocks('f2000000-0000-4000-8000-000000000051'),
	'set/set', 'L5: A''s clock out was written');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000005'),
	'cancelled/clocks', 'L5: still cancelled after the clock out');
reset role;

update public.appointment_employees set clocked_in_at = '2026-10-01 09:15+00', clocked_out_at = '2026-10-01 10:00+00'
	where id = 'f2000000-0000-4000-8000-000000000052';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000005'),
	'cancelled/clocks', 'L5: a clock override does not alter a cancelled row');

update public.appointment_employees set is_archived = true where id = 'f2000000-0000-4000-8000-000000000052';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000005'),
	'cancelled/clocks', 'L5: a crew archive does not alter a cancelled row');

update public.appointments set manually_completed = true where id = 'd2000000-0000-4000-8000-000000000005';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000005'),
	'cancelled/manual', 'L5: a flag change does not alter a cancelled row');

update public.appointments set manually_completed = false where id = 'd2000000-0000-4000-8000-000000000005';
update public.appointments set status = 'scheduled' where id = 'd2000000-0000-4000-8000-000000000005';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000005'),
	'completed/clocks', 'L5: Restore derives completed from the clocks, not the scheduled that was written');


-- L6: Restore derives whatever the clocks and flag say -----------------------------------------

select public.pgtap_lifecycle_appointment('d2000000-0000-4000-8000-000000000006', 'cancelled');
update public.appointments set status = 'in_progress' where id = 'd2000000-0000-4000-8000-000000000006';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000006'),
	'scheduled/clocks', 'L6: Restore with no crew derives scheduled, not the in_progress that was written');

update public.appointments set status = 'cancelled', manually_completed = true where id = 'd2000000-0000-4000-8000-000000000006';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000006'),
	'cancelled/manual', 'L6: cancelled written together with a flag change is kept');

update public.appointments set status = 'scheduled' where id = 'd2000000-0000-4000-8000-000000000006';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000006'),
	'completed/manual', 'L6: Restore of a manually completed row derives completed');

update public.appointments set status = 'cancelled' where id = 'd2000000-0000-4000-8000-000000000006';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000006'),
	'cancelled/manual', 'L6: a completed row can be cancelled');

insert into public.appointment_employees (id, appointment_id, employee_id, clocked_in_at) values
	('f2000000-0000-4000-8000-000000000061', 'd2000000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-00000000000a', '2026-10-01 09:00+00');
update public.appointments set status = 'cancelled', manually_completed = false where id = 'd2000000-0000-4000-8000-000000000006';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000006'),
	'cancelled/clocks', 'L6: adding crew and clearing the flag leave it cancelled');

update public.appointments set status = 'completed' where id = 'd2000000-0000-4000-8000-000000000006';
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-000000000006'),
	'in_progress/clocks', 'L6: Restore with an open shift derives in progress, not the completed that was written');


-- Backfill rule --------------------------------------------------------------------------------

-- A first pass settles whatever rows already exist, so the counts below are this file's alone.
select private.backfill_appointment_status();

-- Rows as they stood before the triggers existed: inserted with triggers off so they keep the
-- status the old code left on them.
set local session_replication_role = replica;

insert into public.appointments (
	id, client_id, job_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, notes, is_archived
)
select id::uuid, 'c2000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
	'c2100000-0000-4000-8000-000000000001', '2026-09-01', '09:00', '11:00', status, '', is_archived
from (values
	-- k1: completed by an admin, nobody clocked.
	('d2000000-0000-4000-8000-0000000000b1', 'completed', false),
	-- k2: completed by an admin while A is still clocked in.
	('d2000000-0000-4000-8000-0000000000b2', 'completed', false),
	-- k3: completed and the clocks agree.
	('d2000000-0000-4000-8000-0000000000b3', 'completed', false),
	-- k4: left in progress though the clocks say completed.
	('d2000000-0000-4000-8000-0000000000b4', 'in_progress', false),
	-- k5: left scheduled though A clocked in.
	('d2000000-0000-4000-8000-0000000000b5', 'scheduled', false),
	-- k6: in progress with nobody clocked in.
	('d2000000-0000-4000-8000-0000000000b6', 'in_progress', false),
	-- k7: cancelled with no clocks, and k8 cancelled with finished clocks.
	('d2000000-0000-4000-8000-0000000000b7', 'cancelled', false),
	('d2000000-0000-4000-8000-0000000000b8', 'cancelled', false),
	-- k9: archived completed with no clocks; k10 archived in progress with no clocks.
	('d2000000-0000-4000-8000-0000000000b9', 'completed', true),
	('d2000000-0000-4000-8000-0000000000ba', 'in_progress', true)
) as fixture (id, status, is_archived);

insert into public.appointment_employees (appointment_id, employee_id, clocked_in_at, clocked_out_at) values
	('d2000000-0000-4000-8000-0000000000b2', 'e2000000-0000-4000-8000-00000000000a', '2026-09-01 09:00+00', null),
	('d2000000-0000-4000-8000-0000000000b3', 'e2000000-0000-4000-8000-00000000000a', '2026-09-01 09:00+00', '2026-09-01 11:00+00'),
	('d2000000-0000-4000-8000-0000000000b4', 'e2000000-0000-4000-8000-00000000000a', '2026-09-01 09:00+00', '2026-09-01 11:00+00'),
	('d2000000-0000-4000-8000-0000000000b4', 'e2000000-0000-4000-8000-00000000000b', null, null),
	('d2000000-0000-4000-8000-0000000000b5', 'e2000000-0000-4000-8000-00000000000a', '2026-09-01 09:00+00', null),
	('d2000000-0000-4000-8000-0000000000b6', 'e2000000-0000-4000-8000-00000000000a', null, null),
	('d2000000-0000-4000-8000-0000000000b8', 'e2000000-0000-4000-8000-00000000000a', '2026-09-01 09:00+00', '2026-09-01 11:00+00');

set local session_replication_role = origin;

select is((select row(flagged_count, status_changed_count)::text from private.backfill_appointment_status()),
	'(2,3)', 'backfill: reports 2 rows flagged and 3 statuses changed');

select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b1'),
	'completed/manual', 'backfill: a completed row with no clocks is flagged and stays completed');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b2'),
	'completed/manual', 'backfill: a completed row with an open shift is flagged and stays completed');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b3'),
	'completed/clocks', 'backfill: a completed row the clocks agree with is not flagged');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b4'),
	'completed/clocks', 'backfill: an in progress row whose clocks say completed becomes completed');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b5'),
	'in_progress/clocks', 'backfill: a scheduled row with an open shift becomes in progress');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b6'),
	'scheduled/clocks', 'backfill: an in progress row with nobody clocked in becomes scheduled');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b7'),
	'cancelled/clocks', 'backfill: a cancelled row with no clocks is untouched');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b8'),
	'cancelled/clocks', 'backfill: a cancelled row with finished clocks is untouched');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000b9'),
	'completed/clocks', 'backfill: an archived completed row is not flagged');
select is(public.pgtap_lifecycle_state('d2000000-0000-4000-8000-0000000000ba'),
	'in_progress/clocks', 'backfill: an archived row is not recalculated');

select is((select row(flagged_count, status_changed_count)::text from private.backfill_appointment_status()),
	'(0,0)', 'backfill: a second run changes nothing');


select * from finish();

rollback;
