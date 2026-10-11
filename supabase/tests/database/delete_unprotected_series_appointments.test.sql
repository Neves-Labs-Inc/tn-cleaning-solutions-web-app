-- delete_unprotected_series_appointments (20261011200000, 20261011220000), called as postgres like
-- the service role.
--
-- Pins that only an unarchived, scheduled, not manually completed appointment with no invoice line
-- at all (Live, Cancelled or released) is deleted, that every other named appointment and its invoice line stay, and that the ids
-- returned are exactly the ones deleted.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);


-- Fixtures --------------------------------------------------------------------------------------

insert into public.clients (id, name) values
	('c8000000-0000-4000-8000-000000000001', 'pgTAP Series Cleanup Client');

insert into public.jobs (id, name, hourly_rate_cents) values
	('b8000000-0000-4000-8000-000000000001', 'pgTAP Series Cleanup Job', 4500);

-- d1: scheduled, nothing on it. d2: scheduled, on an issued invoice. d3: scheduled, on a draft.
-- d4: in progress. d5: completed. d6: scheduled, its only line released by a void.
-- d7: scheduled, archived. d8: scheduled, its only line a Cancelled line on an issued invoice.
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, is_archived)
values
	('d8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-11-01', '09:00', '11:00', 'scheduled', false),
	('d8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-11-08', '09:00', '11:00', 'scheduled', false),
	('d8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-11-15', '09:00', '11:00', 'scheduled', false),
	('d8000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-11-22', '09:00', '11:00', 'in_progress', false),
	('d8000000-0000-4000-8000-000000000005', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-11-29', '09:00', '11:00', 'completed', false),
	('d8000000-0000-4000-8000-000000000006', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-12-06', '09:00', '11:00', 'scheduled', false),
	('d8000000-0000-4000-8000-000000000007', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-12-13', '09:00', '11:00', 'scheduled', true),
	('d8000000-0000-4000-8000-000000000008', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-12-20', '09:00', '11:00', 'scheduled', false);

-- i1: issued. i2: draft. i3: void.
insert into public.invoices (id, client_id, status, is_automatic, invoice_number, issued_date) values
	('18000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'issued', false, 'INV-951-PGT2026', '2026-10-01'),
	('18000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'draft', false, null, null),
	('18000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'void', false, 'INV-952-PGT2026', '2026-10-01');

insert into public.invoice_appointments (invoice_id, appointment_id, is_archived, cancelled_at) values
	('18000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002', false, null),
	('18000000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000003', false, null),
	('18000000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000006', true, null),
	('18000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000008', false, '2026-10-05T12:00:00Z');


-- The call --------------------------------------------------------------------------------------

create temporary table deleted_ids on commit drop as
select * from public.delete_unprotected_series_appointments(array[
	'd8000000-0000-4000-8000-000000000001',
	'd8000000-0000-4000-8000-000000000002',
	'd8000000-0000-4000-8000-000000000003',
	'd8000000-0000-4000-8000-000000000004',
	'd8000000-0000-4000-8000-000000000005',
	'd8000000-0000-4000-8000-000000000006',
	'd8000000-0000-4000-8000-000000000007',
	'd8000000-0000-4000-8000-000000000008'
]::uuid[]) as deleted(id);

select set_eq(
	'select id from deleted_ids',
	array['d8000000-0000-4000-8000-000000000001']::uuid[],
	'returns the ids of the unprotected appointments it deleted');

select set_eq(
	$$select id from public.appointments where client_id = 'c8000000-0000-4000-8000-000000000001'$$,
	array[
		'd8000000-0000-4000-8000-000000000002',
		'd8000000-0000-4000-8000-000000000003',
		'd8000000-0000-4000-8000-000000000004',
		'd8000000-0000-4000-8000-000000000005',
		'd8000000-0000-4000-8000-000000000006',
		'd8000000-0000-4000-8000-000000000007',
		'd8000000-0000-4000-8000-000000000008'
	]::uuid[],
	'keeps every Protected appointment and the archived one');

select ok(
	exists (select 1 from public.invoice_appointments
		where invoice_id = '18000000-0000-4000-8000-000000000001'
			and appointment_id = 'd8000000-0000-4000-8000-000000000002'),
	'a scheduled appointment on an issued invoice keeps its line');

select ok(
	exists (select 1 from public.invoice_appointments
		where invoice_id = '18000000-0000-4000-8000-000000000002'
			and appointment_id = 'd8000000-0000-4000-8000-000000000003'),
	'a scheduled appointment on a draft keeps its line');

select ok(
	exists (select 1 from public.invoice_appointments
		where invoice_id = '18000000-0000-4000-8000-000000000003'
			and appointment_id = 'd8000000-0000-4000-8000-000000000006'),
	'a scheduled appointment whose only line was released by a void keeps that line on the void invoice');

select ok(
	exists (select 1 from public.invoice_appointments
		where invoice_id = '18000000-0000-4000-8000-000000000001'
			and appointment_id = 'd8000000-0000-4000-8000-000000000008'
			and cancelled_at is not null),
	'a scheduled appointment whose only line is a Cancelled line keeps it on the issued invoice');

select is(
	(select status from public.appointments where id = 'd8000000-0000-4000-8000-000000000004'),
	'in_progress', 'an in-progress appointment is left as it was');

select is(
	(select status from public.appointments where id = 'd8000000-0000-4000-8000-000000000005'),
	'completed', 'a completed appointment is left as it was');

select is_empty(
	$$select 1 from public.delete_unprotected_series_appointments(array['d8000000-0000-4000-8000-000000000099']::uuid[])$$,
	'an unknown id deletes nothing');

select function_privs_are('public', 'delete_unprotected_series_appointments', array['uuid[]'],
	'service_role', array['EXECUTE'], 'the service role can call it');


select * from finish();

rollback;
