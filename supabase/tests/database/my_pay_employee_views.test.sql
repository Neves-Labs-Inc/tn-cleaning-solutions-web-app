-- pay_runs_employee_view, pay_run_lines_employee_view and pay_adjustments_employee_view, asserted
-- as the caller (20261014160000).
--
-- A Cleaner reads her own paid Pay runs, their frozen lines and their Adjustments: never a
-- teammate's, never a draft or finalized run, and no admin-only column. An admin and anon get
-- nothing. These tests pin what the caller gets back, never how the views are written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql. Pay runs
-- are inserted directly (as postgres) in the shapes the Payroll functions leave them in.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------
--
-- Ana: a paid regular run for Oct 5 (two lines, one linked and one unlinked Adjustment), a
-- finalized off-cycle run for Oct 5 (unfrozen line) and a draft regular run for Oct 19 (an
-- Adjustment). Bea: a paid regular run for Oct 5 (one line, one Adjustment).

insert into auth.users (id, email) values
	('a6000000-0000-4000-8000-000000000001', 'pgtap.mypay.ana@example.test'),
	('a6000000-0000-4000-8000-000000000002', 'pgtap.mypay.bea@example.test'),
	('a6000000-0000-4000-8000-000000000003', 'pgtap.mypay.admin@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived) values
	('e6000000-0000-4000-8000-00000000000a', 'a6000000-0000-4000-8000-000000000001', 'Ana MyPay', true, false),
	('e6000000-0000-4000-8000-00000000000b', 'a6000000-0000-4000-8000-000000000002', 'Bea MyPay', true, false);

insert into public.clients (id, name) values
	('c6000000-0000-4000-8000-000000000001', 'pgTAP MyPay Client');

insert into public.jobs (id, name, hourly_rate_cents) values
	('b6000000-0000-4000-8000-000000000001', 'pgTAP MyPay Job', 4500);

insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time) values
	('d6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '2026-10-06', '09:00', '12:00'),
	('d6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '2026-10-08', '09:00', '10:00'),
	('d6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '2026-10-10', '09:00', '11:00'),
	('d6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '2026-10-06', '13:00', '15:00');

insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	('f6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-00000000000a', false, '2026-10-06 13:00+00', '2026-10-06 16:15+00'),
	('f6000000-0000-4000-8000-000000000002', 'd6000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-00000000000a', false, '2026-10-08 13:00+00', '2026-10-08 13:45+00'),
	('f6000000-0000-4000-8000-000000000003', 'd6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-00000000000a', false, '2026-10-10 13:00+00', '2026-10-10 15:00+00'),
	('f6000000-0000-4000-8000-000000000004', 'd6000000-0000-4000-8000-000000000004', 'e6000000-0000-4000-8000-00000000000b', false, '2026-10-06 17:00+00', '2026-10-06 19:00+00');

insert into public.pay_runs (id, employee_id, period_start, kind, status, finalized_at, paid_on, payout_method, paid_at, created_by) values
	('90000000-0000-4000-8000-0000000000a1', 'e6000000-0000-4000-8000-00000000000a', '2026-10-05', 'regular', 'paid',
	 '2026-10-19 12:00+00', '2026-10-20', 'e-Transfer', '2026-10-20 12:00+00', 'a6000000-0000-4000-8000-000000000003'),
	('90000000-0000-4000-8000-0000000000a2', 'e6000000-0000-4000-8000-00000000000a', '2026-10-05', 'off_cycle', 'finalized',
	 '2026-10-19 12:00+00', null, null, null, 'a6000000-0000-4000-8000-000000000003'),
	('90000000-0000-4000-8000-0000000000a3', 'e6000000-0000-4000-8000-00000000000a', '2026-10-19', 'regular', 'draft',
	 null, null, null, null, 'a6000000-0000-4000-8000-000000000003'),
	('90000000-0000-4000-8000-0000000000b1', 'e6000000-0000-4000-8000-00000000000b', '2026-10-05', 'regular', 'paid',
	 '2026-10-19 12:00+00', '2026-10-21', 'Cash', '2026-10-21 12:00+00', 'a6000000-0000-4000-8000-000000000003');

insert into public.pay_run_lines (id, pay_run_id, appointment_employee_id, scheduled_date, client_name, job_name, minutes, rate_cents, amount_cents) values
	('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000a1', 'f6000000-0000-4000-8000-000000000001',
	 '2026-10-06', 'Smith residence', 'pgTAP MyPay Job', 195, 2200, 7150),
	('91000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-0000000000a1', 'f6000000-0000-4000-8000-000000000002',
	 '2026-10-08', 'Jones residence', 'pgTAP MyPay Job', 45, 2400, 1800),
	('91000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-0000000000a2', 'f6000000-0000-4000-8000-000000000003',
	 null, null, null, null, null, null),
	('91000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-0000000000b1', 'f6000000-0000-4000-8000-000000000004',
	 '2026-10-06', 'Bea client', 'pgTAP MyPay Job', 120, 2000, 4000);

insert into public.pay_adjustments (id, pay_run_id, amount_cents, reason, appointment_employee_id, created_by, created_at) values
	('92000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000a1', 1500, 'Gas money',
	 'f6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', '2026-10-19 12:00+00'),
	('92000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-0000000000a1', -1000, 'Uniform',
	 null, 'a6000000-0000-4000-8000-000000000003', '2026-10-19 12:05+00'),
	('92000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-0000000000a3', 2500, 'Draft bonus',
	 null, 'a6000000-0000-4000-8000-000000000003', '2026-10-19 12:10+00'),
	('92000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-0000000000b1', 500, 'Bea parking',
	 null, 'a6000000-0000-4000-8000-000000000003', '2026-10-19 12:15+00');


-- Columns and grants (catalog) ------------------------------------------------------------------

select columns_are(
	'public', 'pay_runs_employee_view',
	array['id', 'period_start', 'kind', 'paid_on', 'payout_method', 'total_cents'],
	'the runs view exposes only what My pay shows: no status, creator or Payout default'
);

select columns_are(
	'public', 'pay_run_lines_employee_view',
	array['id', 'pay_run_id', 'scheduled_date', 'client_name', 'minutes', 'rate_cents', 'amount_cents'],
	'the lines view exposes only frozen values: no session id, no base rate or premium'
);

select columns_are(
	'public', 'pay_adjustments_employee_view',
	array['id', 'pay_run_id', 'amount_cents', 'reason', 'linked_scheduled_date', 'linked_client_name', 'created_at'],
	'the Adjustments view exposes the amount, reason and linked line, not who added it'
);

select ok(
	has_table_privilege('authenticated', 'public.pay_runs_employee_view', 'SELECT')
		and not has_table_privilege('authenticated', 'public.pay_runs_employee_view', 'INSERT, UPDATE, DELETE')
		and has_table_privilege('authenticated', 'public.pay_run_lines_employee_view', 'SELECT')
		and not has_table_privilege('authenticated', 'public.pay_run_lines_employee_view', 'INSERT, UPDATE, DELETE')
		and has_table_privilege('authenticated', 'public.pay_adjustments_employee_view', 'SELECT')
		and not has_table_privilege('authenticated', 'public.pay_adjustments_employee_view', 'INSERT, UPDATE, DELETE'),
	'a signed-in caller holds SELECT only on the three views'
);


-- As Ana --------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a6000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select results_eq(
	$$ select id, period_start, kind, paid_on, payout_method, total_cents::bigint from public.pay_runs_employee_view $$,
	$$ values ('90000000-0000-4000-8000-0000000000a1'::uuid, '2026-10-05'::date, 'regular', '2026-10-20'::date, 'e-Transfer', 9450::bigint) $$,
	'a Cleaner reads only her own paid run, with its total of lines plus Adjustments'
);

select results_eq(
	$$ select pay_run_id, scheduled_date, client_name, minutes, rate_cents, amount_cents
		from public.pay_run_lines_employee_view order by scheduled_date $$,
	$$ values
		('90000000-0000-4000-8000-0000000000a1'::uuid, '2026-10-06'::date, 'Smith residence', 195, 2200, 7150),
		('90000000-0000-4000-8000-0000000000a1'::uuid, '2026-10-08'::date, 'Jones residence', 45, 2400, 1800) $$,
	'a Cleaner reads the frozen lines of her paid run only'
);

select results_eq(
	$$ select pay_run_id, amount_cents, reason, linked_scheduled_date, linked_client_name
		from public.pay_adjustments_employee_view order by created_at $$,
	$$ values
		('90000000-0000-4000-8000-0000000000a1'::uuid, 1500, 'Gas money', '2026-10-06'::date, 'Smith residence'),
		('90000000-0000-4000-8000-0000000000a1'::uuid, -1000, 'Uniform', null::date, null::text) $$,
	'a Cleaner reads her paid run''s Adjustments, with the linked line''s date and client'
);

select is_empty(
	$$ select id from public.pay_runs_employee_view
		where id in ('90000000-0000-4000-8000-0000000000a2', '90000000-0000-4000-8000-0000000000a3') $$,
	'a Cleaner does not read her own finalized or draft run'
);

select is_empty(
	$$ select id from public.pay_adjustments_employee_view where pay_run_id = '90000000-0000-4000-8000-0000000000a3' $$,
	'a Cleaner does not read an Adjustment on her draft run'
);

select is_empty(
	$$ select id from public.pay_runs_employee_view where id = '90000000-0000-4000-8000-0000000000b1'
		union all select id from public.pay_run_lines_employee_view where pay_run_id = '90000000-0000-4000-8000-0000000000b1'
		union all select id from public.pay_adjustments_employee_view where pay_run_id = '90000000-0000-4000-8000-0000000000b1' $$,
	'a Cleaner does not read a teammate''s run, lines or Adjustments'
);

select is_empty(
	$$ select id from public.pay_runs $$,
	'the base pay_runs table stays closed to a Cleaner'
);

-- The views are not auto-updatable, so Postgres refuses a write before checking privileges.
select throws_ok(
	$$ insert into public.pay_runs_employee_view (id) values (gen_random_uuid()) $$,
	'55000',
	null,
	'a Cleaner cannot write through the runs view'
);


-- As Bea --------------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a6000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select results_eq(
	$$ select id, total_cents::bigint from public.pay_runs_employee_view $$,
	$$ values ('90000000-0000-4000-8000-0000000000b1'::uuid, 4500::bigint) $$,
	'a teammate reads only her own paid run'
);


-- As an admin ---------------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a6000000-0000-4000-8000-000000000003", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is_empty(
	$$ select id from public.pay_runs_employee_view
		union all select id from public.pay_run_lines_employee_view
		union all select id from public.pay_adjustments_employee_view $$,
	'an admin, who is no Cleaner, gets no rows: admins read the Payroll tables'
);


-- As anon -------------------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok(
	$$ select id from public.pay_runs_employee_view $$,
	'42501',
	null,
	'an unauthenticated caller cannot read the runs view'
);

select throws_ok(
	$$ select id from public.pay_run_lines_employee_view union all select id from public.pay_adjustments_employee_view $$,
	'42501',
	null,
	'an unauthenticated caller cannot read the lines or Adjustments view'
);

reset role;

select * from finish();

rollback;
