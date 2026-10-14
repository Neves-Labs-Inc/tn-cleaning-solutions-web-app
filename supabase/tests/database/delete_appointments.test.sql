-- delete_appointments and the narrowed append-only guard (20261014193700).
--
-- Pins what a permanent delete removes (crew rows, clocks, Clock corrections, acknowledgements,
-- invoice lines), what it does to each invoice it touches, the paid-invoice skip, the Series
-- change per scope, that a deleted completed visit never joins an Automatic draft, and that
-- clock_corrections and odd_duration_acknowledgements stay append-only outside the function.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(35);


-- Helpers (as postgres) ------------------------------------------------------------------------

-- Runs a statement as the current role and returns the SQLSTATE and DETAIL it raised, or null.
create function public.pgtap_raised(statement text) returns text
	language plpgsql
	as $$
declare
	raised_state text;
	raised_detail text;
begin
	execute statement;
	return null;
exception when others then
	get stacked diagnostics raised_state = returned_sqlstate, raised_detail = pg_exception_detail;
	return raised_state || coalesce(':' || nullif(raised_detail, ''), '');
end;
$$;


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a9000000-0000-4000-8000-000000000001', 'pgtap.delete.admin@example.test'),
	('a9000000-0000-4000-8000-000000000002', 'pgtap.delete.employee@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, address, e_transfer_email) values
	('e9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000002', 'Delete Employee', true, false, '1 A St', 'a@pay.test');

-- Manual while the fixtures are built, so completing a visit joins no draft; Automatic before the calls.
insert into public.clients (id, name, automatic_invoicing) values
	('c9000000-0000-4000-8000-000000000001', 'pgTAP Delete Client', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b9000000-0000-4000-8000-000000000001', 'pgTAP Delete Job', 4500);

-- s1: occurrence. s2: this and following. s3: whole series.
insert into public.recurrence_series (id, interval_unit, interval_count, start_date, end_date, client_id, job_id) values
	('59000000-0000-4000-8000-000000000001', 'week', 1, '2026-09-01', null, 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001'),
	('59000000-0000-4000-8000-000000000002', 'week', 1, '2026-11-01', null, 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001'),
	('59000000-0000-4000-8000-000000000003', 'week', 1, '2026-12-01', null, 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001');

-- v1: completed, clocked, corrected and acknowledged, the only line on Automatic draft i1, in s1.
-- v2, v3: completed, both on issued i2. v4: completed, on issued i3 with v5's Cancelled line.
-- v6: cancelled, its Cancelled line on paid i4, where v7 is live. v8, v9: s2. v10 (on paid i4),
-- v11: s3. v12: completed and clocked, no line. v13: archived.
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, is_archived, recurrence_series_id)
values
	('d9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-01', '09:00', '11:00', 'completed', false, '59000000-0000-4000-8000-000000000001'),
	('d9000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-02', '09:00', '11:00', 'completed', false, null),
	('d9000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-03', '09:00', '11:00', 'completed', false, null),
	('d9000000-0000-4000-8000-000000000004', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-04', '09:00', '11:00', 'completed', false, null),
	('d9000000-0000-4000-8000-000000000005', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-05', '09:00', '11:00', 'cancelled', false, null),
	('d9000000-0000-4000-8000-000000000006', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-06', '09:00', '11:00', 'cancelled', false, null),
	('d9000000-0000-4000-8000-000000000007', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-07', '09:00', '11:00', 'completed', false, null),
	('d9000000-0000-4000-8000-000000000008', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-11-01', '09:00', '11:00', 'scheduled', false, '59000000-0000-4000-8000-000000000002'),
	('d9000000-0000-4000-8000-000000000009', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-11-08', '09:00', '11:00', 'scheduled', false, '59000000-0000-4000-8000-000000000002'),
	('d9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-12-01', '09:00', '11:00', 'completed', false, '59000000-0000-4000-8000-000000000003'),
	('d9000000-0000-4000-8000-000000000011', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-12-08', '09:00', '11:00', 'scheduled', false, '59000000-0000-4000-8000-000000000003'),
	('d9000000-0000-4000-8000-000000000012', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-12', '09:00', '11:00', 'completed', false, null),
	('d9000000-0000-4000-8000-000000000013', 'c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', '2026-09-13', '09:00', '11:00', 'scheduled', true, null);

insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	('f9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', false,
	 '2026-09-01T13:00:00Z', '2026-09-01T15:00:00Z'),
	-- A Removed session on v1: it goes too.
	('f9000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', true,
	 '2026-09-01T13:00:00Z', '2026-09-01T13:30:00Z'),
	('f9000000-0000-4000-8000-000000000012', 'd9000000-0000-4000-8000-000000000012', 'e9000000-0000-4000-8000-000000000001', false,
	 '2026-09-12T13:00:00Z', '2026-09-12T15:00:00Z');

insert into public.clock_corrections (appointment_employee_id, corrected_by, corrected_by_name, new_clock_in, new_clock_out, reason) values
	('f9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'Pat Admin', '2026-09-01T13:00:00Z', '2026-09-01T15:00:00Z', 'fixture'),
	('f9000000-0000-4000-8000-000000000012', 'a9000000-0000-4000-8000-000000000001', 'Pat Admin', '2026-09-12T13:00:00Z', '2026-09-12T15:00:00Z', 'kept');
insert into public.odd_duration_acknowledgements (appointment_employee_id, acknowledged_by, acknowledged_by_name, clock_in, clock_out, note) values
	('f9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000001', 'Pat Admin', '2026-09-01T13:00:00Z', '2026-09-01T13:30:00Z', 'fixture');

-- i1: Automatic draft. i2, i3: issued. i4: paid.
insert into public.invoices (id, client_id, status, is_automatic, invoice_number, issued_date, paid_date, payment_method) values
	('19000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001', 'draft', true, null, null, null, null),
	('19000000-0000-4000-8000-000000000002', 'c9000000-0000-4000-8000-000000000001', 'issued', false, 'INV-961-PGT2026', '2026-10-01', null, null),
	('19000000-0000-4000-8000-000000000003', 'c9000000-0000-4000-8000-000000000001', 'issued', false, 'INV-962-PGT2026', '2026-10-01', null, null),
	('19000000-0000-4000-8000-000000000004', 'c9000000-0000-4000-8000-000000000001', 'paid', false, 'INV-963-PGT2026', '2026-10-01', '2026-10-02', 'Cash');

insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents, cancelled_at) values
	('19000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', null, null),
	('19000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000002', 5000, null),
	('19000000-0000-4000-8000-000000000002', 'd9000000-0000-4000-8000-000000000003', 7000, null),
	('19000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000004', 5000, null),
	('19000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000005', 0, '2026-10-03T12:00:00Z'),
	('19000000-0000-4000-8000-000000000004', 'd9000000-0000-4000-8000-000000000006', 0, '2026-10-03T12:00:00Z'),
	('19000000-0000-4000-8000-000000000004', 'd9000000-0000-4000-8000-000000000007', 6000, null),
	('19000000-0000-4000-8000-000000000004', 'd9000000-0000-4000-8000-000000000010', 4000, null);

update public.clients set automatic_invoicing = true where id = 'c9000000-0000-4000-8000-000000000001';


-- Refusals -------------------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims = '{"sub": "a9000000-0000-4000-8000-000000000002", "role": "authenticated", "email": "pgtap.delete.employee@example.test"}';
select is(public.pgtap_raised($$
	select public.delete_appointments(array['d9000000-0000-4000-8000-000000000012']::uuid[], null, 'none', null)
$$), 'P0001:not_admin', 'an employee gets not_admin');

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
select is(public.pgtap_raised($$
	select public.delete_appointments(array['d9000000-0000-4000-8000-000000000012']::uuid[], null, 'none', null)
$$), 'P0001:not_admin', 'anon gets not_admin');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "a9000000-0000-4000-8000-000000000001", "role": "authenticated", "email": "pgtap.delete.admin@example.test", "app_metadata": {"role": "admin"}}';

select is(public.pgtap_raised($$
	select public.delete_appointments(array['d9000000-0000-4000-8000-000000000012']::uuid[], null, 'shorten', null)
$$), '22023', 'an unknown series change raises 22023');
select is(public.pgtap_raised($$
	select public.delete_appointments(array['d9000000-0000-4000-8000-000000000012']::uuid[], '59000000-0000-4000-8000-000000000002', 'end_before', null)
$$), '22023', 'end_before without a date raises 22023');
select is(public.pgtap_raised($$
	select public.delete_appointments(array['d9000000-0000-4000-8000-000000000012']::uuid[], null, 'delete', null)
$$), '22023', 'delete without a series id raises 22023');


-- The calls, as admin --------------------------------------------------------------------------

create temporary table results (label text primary key, result jsonb) on commit drop;

insert into results values ('occurrence', public.delete_appointments(array[
	'd9000000-0000-4000-8000-000000000001',
	'd9000000-0000-4000-8000-000000000012',
	'd9000000-0000-4000-8000-000000000013',
	'd9000000-0000-4000-8000-0000000000ff'
]::uuid[], null, 'none', null));

insert into results values ('issued', public.delete_appointments(array[
	'd9000000-0000-4000-8000-000000000002',
	'd9000000-0000-4000-8000-000000000004',
	'd9000000-0000-4000-8000-000000000006'
]::uuid[], null, 'none', null));

insert into results values ('future', public.delete_appointments(array[
	'd9000000-0000-4000-8000-000000000009'
]::uuid[], '59000000-0000-4000-8000-000000000002', 'end_before', '2026-11-08'));

insert into results values ('series', public.delete_appointments(array[
	'd9000000-0000-4000-8000-000000000010',
	'd9000000-0000-4000-8000-000000000011'
]::uuid[], '59000000-0000-4000-8000-000000000003', 'delete', null));

reset role;


-- Clocks and audit rows ------------------------------------------------------------------------

select is((select result from results where label = 'occurrence'),
	'{"deleted": ["d9000000-0000-4000-8000-000000000001", "d9000000-0000-4000-8000-000000000012"], "skipped": [], "invoice_ids": ["19000000-0000-4000-8000-000000000001"]}'::jsonb,
	'returns the deleted ids and the invoice that lost a line, leaving archived and missing ids out silently');
select is_empty($$ select 1 from public.appointments where id in ('d9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000012') $$,
	'the visits are gone');
select is_empty($$ select 1 from public.appointment_employees where appointment_id in ('d9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000012') $$,
	'their crew rows and clocks are gone, Removed sessions included');
select is_empty($$ select 1 from public.clock_corrections where appointment_employee_id in ('f9000000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000012') $$,
	'their Clock corrections are gone');
select is_empty($$ select 1 from public.odd_duration_acknowledgements where appointment_employee_id = 'f9000000-0000-4000-8000-000000000002' $$,
	'their Odd duration acknowledgements are gone');
select ok(exists (select 1 from public.appointments where id = 'd9000000-0000-4000-8000-000000000013'),
	'an archived id is left alone');

-- The guard is back on after the function, even in the same transaction.
insert into public.appointment_employees (id, appointment_id, employee_id, is_archived, clocked_in_at, clocked_out_at) values
	('f9000000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000003', 'e9000000-0000-4000-8000-000000000001', false,
	 '2026-09-03T13:00:00Z', '2026-09-03T15:00:00Z');
insert into public.clock_corrections (appointment_employee_id, corrected_by, corrected_by_name, reason) values
	('f9000000-0000-4000-8000-000000000003', 'a9000000-0000-4000-8000-000000000001', 'Pat Admin', 'after');
insert into public.odd_duration_acknowledgements (appointment_employee_id, acknowledged_by, acknowledged_by_name, clock_in, clock_out, note) values
	('f9000000-0000-4000-8000-000000000003', 'a9000000-0000-4000-8000-000000000001', 'Pat Admin', '2026-09-03T13:00:00Z', '2026-09-03T15:00:00Z', 'after');

select throws_ok($$ delete from public.clock_corrections $$, 'P0001', null,
	'a direct delete of a correction is still refused, even by postgres');
select throws_ok($$ delete from public.odd_duration_acknowledgements $$, 'P0001', null,
	'a direct delete of an acknowledgement is still refused, even by postgres');
select throws_ok($$ update public.clock_corrections set reason = 'changed' $$, 'P0001', null,
	'a correction still can''t be updated');
select throws_ok($$ update public.odd_duration_acknowledgements set note = 'changed' $$, 'P0001', null,
	'an acknowledgement still can''t be updated');
select throws_ok($$ delete from public.appointment_employees where id = 'f9000000-0000-4000-8000-000000000003' $$, '23503', null,
	'a session with a correction still can''t be deleted outside the function');
select is(public.pgtap_raised($$
	do $do$
	begin
		perform set_config('app.deleting_appointments', 'on', true);
		update public.clock_corrections set reason = 'changed';
	end
	$do$
$$), 'P0001', 'an update is refused even with the flag on');


-- Invoices -------------------------------------------------------------------------------------

select is_empty($$ select 1 from public.invoices where id = '19000000-0000-4000-8000-000000000001' $$,
	'an Automatic draft left with no live line is deleted');
select is_empty($$ select 1 from public.invoices where client_id = 'c9000000-0000-4000-8000-000000000001' and is_automatic and status = 'draft' $$,
	'deleting completed visits on an Automatic client creates or joins no Automatic draft');

select is((select result from results where label = 'issued'),
	'{"deleted": ["d9000000-0000-4000-8000-000000000002", "d9000000-0000-4000-8000-000000000004"], "skipped": [{"id": "d9000000-0000-4000-8000-000000000006", "reason": "paid_invoice"}], "invoice_ids": ["19000000-0000-4000-8000-000000000002", "19000000-0000-4000-8000-000000000003"]}'::jsonb,
	'skips the visit with a Cancelled line on a paid invoice');
select is((select row(status, total_cents)::text from public.invoices_with_status where id = '19000000-0000-4000-8000-000000000002'),
	'(issued,7000)', 'an issued invoice keeps its other line and its total drops');
select is((select status from public.invoices where id = '19000000-0000-4000-8000-000000000003'),
	'void', 'an issued invoice left with only a Cancelled line becomes void');
select ok((select bool_and(is_archived) from public.invoice_appointments where invoice_id = '19000000-0000-4000-8000-000000000003'),
	'the voided invoice''s lines are released');
select ok(exists (select 1 from public.appointments where id = 'd9000000-0000-4000-8000-000000000006'),
	'the skipped visit stays');
select is((select row(status, total_cents)::text from public.invoices_with_status where id = '19000000-0000-4000-8000-000000000004'),
	'(paid,10000)', 'the paid invoice keeps its total');
select is((select count(*) from public.invoice_appointments where invoice_id = '19000000-0000-4000-8000-000000000004'),
	3::bigint, 'the paid invoice keeps every line');


-- Series ---------------------------------------------------------------------------------------

select ok(exists (select 1 from public.recurrence_series where id = '59000000-0000-4000-8000-000000000001' and end_date is null),
	'occurrence leaves the Series alone');

select is((select result -> 'deleted' from results where label = 'future'),
	'["d9000000-0000-4000-8000-000000000009"]'::jsonb, 'future deletes the visits sent');
select is((select end_date from public.recurrence_series where id = '59000000-0000-4000-8000-000000000002'),
	'2026-11-07'::date, 'future ends the Series the day before the chosen visit');
select ok(exists (select 1 from public.appointments where id = 'd9000000-0000-4000-8000-000000000008' and recurrence_series_id = '59000000-0000-4000-8000-000000000002'),
	'future keeps the earlier visit in the Series');

select is((select result from results where label = 'series'),
	'{"deleted": ["d9000000-0000-4000-8000-000000000011"], "skipped": [{"id": "d9000000-0000-4000-8000-000000000010", "reason": "paid_invoice"}], "invoice_ids": []}'::jsonb,
	'series skips the visit on a paid invoice');
select is_empty($$ select 1 from public.recurrence_series where id = '59000000-0000-4000-8000-000000000003' $$,
	'series removes the Series row');
select ok(exists (select 1 from public.appointments where id = 'd9000000-0000-4000-8000-000000000010' and recurrence_series_id is null),
	'the skipped visit stays, standalone');

-- Everything skipped: nothing deleted, so the Series is left alone.
set local role authenticated;
set local request.jwt.claims = '{"sub": "a9000000-0000-4000-8000-000000000001", "role": "authenticated", "email": "pgtap.delete.admin@example.test", "app_metadata": {"role": "admin"}}';
select is(public.delete_appointments(array['d9000000-0000-4000-8000-000000000007']::uuid[], '59000000-0000-4000-8000-000000000001', 'delete', null),
	'{"deleted": [], "skipped": [{"id": "d9000000-0000-4000-8000-000000000007", "reason": "paid_invoice"}], "invoice_ids": []}'::jsonb,
	'a call that skips every visit deletes nothing');
reset role;
select ok(exists (select 1 from public.recurrence_series where id = '59000000-0000-4000-8000-000000000001'),
	'and leaves the Series alone');


select * from finish();

rollback;
