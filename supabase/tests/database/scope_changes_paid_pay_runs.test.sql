-- delete_appointments and cancel_appointments against Payroll (20261014235000).
--
-- A visit with a session on a paid Pay run, or a session an Adjustment on a paid run points at,
-- is skipped as paid_pay_run by both: paid amounts are frozen. Deleting a visit whose sessions are
-- claimed by an unpaid (finalized) run releases those claims and unlinks unpaid Adjustments, so
-- the delete never trips the RESTRICT foreign keys from pay_run_lines and pay_adjustments.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a6000000-0000-4000-8000-000000000001', 'pgtap.scope.pay.admin@example.test'),
	('a6000000-0000-4000-8000-000000000002', 'pgtap.scope.pay.a@example.test'),
	('a6000000-0000-4000-8000-000000000003', 'pgtap.scope.pay.b@example.test');

-- A: her run is paid. B: her run is finalized, not paid.
insert into public.employees (id, user_id, full_name) values
	('e6000000-0000-4000-8000-00000000000a', 'a6000000-0000-4000-8000-000000000002', 'Paid Cleaner'),
	('e6000000-0000-4000-8000-00000000000b', 'a6000000-0000-4000-8000-000000000003', 'Finalized Cleaner');

insert into public.clients (id, name, automatic_invoicing) values
	('c6000000-0000-4000-8000-000000000001', 'pgTAP Scope Pay Client', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b6000000-0000-4000-8000-000000000001', 'pgTAP Scope Pay Job', 4500);

-- v1: A's session on her paid run, B's on her finalized run -> skipped by both.
-- v2: B's session on her finalized run, an unpaid Adjustment on it -> deleted, claim released.
-- v3: A's unclaimed session, pointed at by an Adjustment on her paid run -> skipped by both.
-- v4: no Payroll rows -> cancelled.
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, status) values
	('d6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '2026-10-06', '09:00', '11:00', 'completed'),
	('d6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '2026-10-07', '09:00', '11:00', 'completed'),
	('d6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '2026-10-08', '09:00', '11:00', 'completed'),
	('d6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '2026-10-09', '09:00', '11:00', 'scheduled');

insert into public.appointment_employees (id, appointment_id, employee_id, clocked_in_at, clocked_out_at) values
	('f6000000-0000-4000-8000-0000000000a1', 'd6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-00000000000a',
	 '2026-10-06T13:00:00Z', '2026-10-06T15:00:00Z'),
	('f6000000-0000-4000-8000-0000000000b1', 'd6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-00000000000b',
	 '2026-10-06T13:00:00Z', '2026-10-06T15:00:00Z'),
	('f6000000-0000-4000-8000-0000000000b2', 'd6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-00000000000b',
	 '2026-10-07T13:00:00Z', '2026-10-07T15:00:00Z'),
	('f6000000-0000-4000-8000-0000000000a3', 'd6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-00000000000a',
	 '2026-10-08T13:00:00Z', '2026-10-08T15:00:00Z');

insert into public.pay_runs
	(id, employee_id, period_start, kind, status, finalized_at, paid_on, payout_method, paid_at, created_by) values
	('86000000-0000-4000-8000-00000000000a', 'e6000000-0000-4000-8000-00000000000a', '2026-10-05', 'regular', 'paid',
	 '2026-10-19T12:00:00Z', '2026-10-20', 'e-Transfer', '2026-10-20T12:00:00Z', 'a6000000-0000-4000-8000-000000000001'),
	('86000000-0000-4000-8000-00000000000b', 'e6000000-0000-4000-8000-00000000000b', '2026-10-05', 'regular', 'finalized',
	 '2026-10-19T12:00:00Z', null, null, null, 'a6000000-0000-4000-8000-000000000001');

insert into public.pay_run_lines
	(pay_run_id, appointment_employee_id, scheduled_date, client_name, job_name, minutes, rate_cents, amount_cents) values
	('86000000-0000-4000-8000-00000000000a', 'f6000000-0000-4000-8000-0000000000a1', '2026-10-06', 'pgTAP Scope Pay Client',
	 'pgTAP Scope Pay Job', 120, 2000, 4000),
	('86000000-0000-4000-8000-00000000000b', 'f6000000-0000-4000-8000-0000000000b1', null, null, null, null, null, null),
	('86000000-0000-4000-8000-00000000000b', 'f6000000-0000-4000-8000-0000000000b2', null, null, null, null, null, null);

insert into public.pay_adjustments (id, pay_run_id, amount_cents, reason, appointment_employee_id, created_by) values
	('76000000-0000-4000-8000-00000000000a', '86000000-0000-4000-8000-00000000000a', 500, 'Paid supplies',
	 'f6000000-0000-4000-8000-0000000000a3', 'a6000000-0000-4000-8000-000000000001'),
	('76000000-0000-4000-8000-00000000000b', '86000000-0000-4000-8000-00000000000b', 300, 'Unpaid supplies',
	 'f6000000-0000-4000-8000-0000000000b2', 'a6000000-0000-4000-8000-000000000001');


-- Delete, as admin -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a6000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is(
	public.delete_appointments(array[
		'd6000000-0000-4000-8000-000000000001',
		'd6000000-0000-4000-8000-000000000002',
		'd6000000-0000-4000-8000-000000000003'
	]::uuid[], null, 'none', null),
	jsonb_build_object(
		'deleted', jsonb_build_array('d6000000-0000-4000-8000-000000000002'),
		'skipped', jsonb_build_array(
			jsonb_build_object('id', 'd6000000-0000-4000-8000-000000000001', 'reason', 'paid_pay_run'),
			jsonb_build_object('id', 'd6000000-0000-4000-8000-000000000003', 'reason', 'paid_pay_run')),
		'invoice_ids', '[]'::jsonb),
	'delete skips the visits on a paid Pay run and deletes the one only a finalized run claims'
);

reset role;

select is((select count(*)::integer from public.appointments where id in (
		'd6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000003')),
	2, 'the paid-run visits are still there');

select is((select count(*)::integer from public.appointment_employees where appointment_id in (
		'd6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000003')),
	3, 'their sessions are still there');

select is((select count(*)::integer from public.pay_run_lines where appointment_employee_id in (
		'f6000000-0000-4000-8000-0000000000a1', 'f6000000-0000-4000-8000-0000000000b1')),
	2, 'their claims are still there, the crewmate''s finalized claim too');

select is((select count(*)::integer from public.pay_run_lines where appointment_employee_id = 'f6000000-0000-4000-8000-0000000000b2'),
	0, 'the deleted session''s finalized claim is released');

select is((select status from public.pay_runs where id = '86000000-0000-4000-8000-00000000000b'),
	'finalized', 'the finalized run stays finalized');

select is((select appointment_employee_id from public.pay_adjustments where id = '76000000-0000-4000-8000-00000000000b'),
	null, 'the unpaid Adjustment stays, no longer pointing at the deleted session');

select is((select appointment_employee_id from public.pay_adjustments where id = '76000000-0000-4000-8000-00000000000a'),
	'f6000000-0000-4000-8000-0000000000a3'::uuid, 'the paid Adjustment still points at its session');


-- Cancel, as admin -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a6000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is(
	public.cancel_appointments(array[
		'd6000000-0000-4000-8000-000000000001',
		'd6000000-0000-4000-8000-000000000003',
		'd6000000-0000-4000-8000-000000000004'
	]::uuid[]),
	jsonb_build_object(
		'cancelled', jsonb_build_array('d6000000-0000-4000-8000-000000000004'),
		'skipped', jsonb_build_array(
			jsonb_build_object('id', 'd6000000-0000-4000-8000-000000000001', 'reason', 'paid_pay_run'),
			jsonb_build_object('id', 'd6000000-0000-4000-8000-000000000003', 'reason', 'paid_pay_run')),
		'invoice_ids', '[]'::jsonb),
	'cancel skips the visits on a paid Pay run'
);

reset role;

select is((select status from public.appointments where id = 'd6000000-0000-4000-8000-000000000001'),
	'completed', 'a visit with a paid session is not cancelled');

select is((select status from public.appointments where id = 'd6000000-0000-4000-8000-000000000003'),
	'completed', 'a visit with a paid Adjustment''s session is not cancelled');

select is((select status from public.appointments where id = 'd6000000-0000-4000-8000-000000000004'),
	'cancelled', 'a visit with no Payroll rows is cancelled');


select * from finish();

rollback;
