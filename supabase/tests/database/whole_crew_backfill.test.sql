-- private.backfill_whole_crew_status() (20261013120000): existing appointments re-derive under the
-- whole-crew rule, except a would-reopen visit on an issued or paid invoice, which is flagged
-- Manual completion and stays completed.
--
-- Rows are inserted with triggers off so they keep the status the old rule left on them, then the
-- backfill runs. Asserts appointments.status, manually_completed, invoice lines and the reported
-- counts only. Fixtures are rolled back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);


-- Helpers --------------------------------------------------------------------------------------

-- Visit w<n> (n one hex digit) and invoice i<n>.
create function public.pgtap_whole_crew_visit(n text) returns uuid
	language sql immutable
	as $$ select ('d7000000-0000-4000-8000-00000000000' || n)::uuid $$;

create function public.pgtap_whole_crew_invoice(n text) returns uuid
	language sql immutable
	as $$ select ('17000000-0000-4000-8000-00000000000' || n)::uuid $$;

-- "<status>/<manual|clocks>".
create function public.pgtap_whole_crew_state(n text) returns text
	language sql
	as $$
	select status || '/' || case when manually_completed then 'manual' else 'clocks' end
	from public.appointments
	where id = public.pgtap_whole_crew_visit(n);
$$;


-- Fixtures (as postgres) -----------------------------------------------------------------------

-- A first pass settles whatever rows already exist, so the counts below are this file's alone.
select private.backfill_whole_crew_status();

-- Rows as the old rule left them: inserted with triggers off so they keep their stale status.
set local session_replication_role = replica;

insert into auth.users (id, email) values
	('a7000000-0000-4000-8000-000000000001', 'pgtap.wholecrew.a@example.test'),
	('a7000000-0000-4000-8000-000000000002', 'pgtap.wholecrew.b@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, address, e_transfer_contact) values
	('e7000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-000000000001', 'Whole Crew A', true, false, '1 A St', 'a@pay.test'),
	('e7000000-0000-4000-8000-00000000000b', 'a7000000-0000-4000-8000-000000000002', 'Whole Crew B', true, false, '2 B St', 'b@pay.test');

insert into public.clients (id, name) values
	('c7000000-0000-4000-8000-000000000001', 'pgTAP Whole Crew Client');

insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b7000000-0000-4000-8000-000000000001', 'pgTAP Whole Crew Job', 4500, false);

-- Every visit has Cleaners A and B. "Half" = A clocked in and out, B never clocked: completed under
-- the old rule, in progress under the whole-crew rule. "Full" = both clocked in and out.
--   w1 half, no invoice line          w2 half, on a manual draft         w3 half, on an issued invoice
--   w4 half, on a paid invoice        w5 half, only on a void invoice    w6 half, archived issued line
--   w7 half, cancelled issued line    w8 half, manually completed        w9 half, cancelled
--   wa half, archived                 wb full, completed
insert into public.appointments (
	id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, manually_completed, is_archived
)
select public.pgtap_whole_crew_visit(n), 'c7000000-0000-4000-8000-000000000001',
	'b7000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00', status, manually_completed, is_archived
from (values
	('1', 'completed', false, false),
	('2', 'completed', false, false),
	('3', 'completed', false, false),
	('4', 'completed', false, false),
	('5', 'completed', false, false),
	('6', 'completed', false, false),
	('7', 'completed', false, false),
	('8', 'completed', true, false),
	('9', 'cancelled', false, false),
	('a', 'completed', false, true),
	('b', 'completed', false, false)
) as fixture (n, status, manually_completed, is_archived);

insert into public.appointment_employees (appointment_id, employee_id, clocked_in_at, clocked_out_at)
select public.pgtap_whole_crew_visit(n), 'e7000000-0000-4000-8000-00000000000a', '2026-10-01 09:00+00', '2026-10-01 11:00+00'
from unnest(array['1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b']) as n;

insert into public.appointment_employees (appointment_id, employee_id, clocked_in_at, clocked_out_at)
select public.pgtap_whole_crew_visit(n), 'e7000000-0000-4000-8000-00000000000b', null, null
from unnest(array['1', '2', '3', '4', '5', '6', '7', '8', '9', 'a']) as n;

insert into public.appointment_employees (appointment_id, employee_id, clocked_in_at, clocked_out_at) values
	(public.pgtap_whole_crew_visit('b'), 'e7000000-0000-4000-8000-00000000000b', '2026-10-01 09:00+00', '2026-10-01 11:00+00');

-- i2 manual draft, i3 issued, i4 paid, i5 void, i6 issued (w6's line released), i7 issued (w7's
-- line cancelled, kept alive by wb's line).
insert into public.invoices (id, client_id, status, is_automatic, invoice_number, issued_date, paid_date, payment_method) values
	(public.pgtap_whole_crew_invoice('2'), 'c7000000-0000-4000-8000-000000000001', 'draft', false, null, null, null, null),
	(public.pgtap_whole_crew_invoice('3'), 'c7000000-0000-4000-8000-000000000001', 'issued', false, 'INV-971-PGT2026', '2026-10-02', null, null),
	(public.pgtap_whole_crew_invoice('4'), 'c7000000-0000-4000-8000-000000000001', 'paid', false, 'INV-972-PGT2026', '2026-10-02', '2026-10-03', 'Cash'),
	(public.pgtap_whole_crew_invoice('5'), 'c7000000-0000-4000-8000-000000000001', 'void', false, 'INV-973-PGT2026', '2026-10-02', null, null),
	(public.pgtap_whole_crew_invoice('6'), 'c7000000-0000-4000-8000-000000000001', 'issued', false, 'INV-974-PGT2026', '2026-10-02', null, null),
	(public.pgtap_whole_crew_invoice('7'), 'c7000000-0000-4000-8000-000000000001', 'issued', false, 'INV-975-PGT2026', '2026-10-02', null, null);

-- w5's void line is left unreleased so only the invoice status keeps it from protecting the visit.
insert into public.invoice_appointments (invoice_id, appointment_id, is_archived, cancelled_at) values
	(public.pgtap_whole_crew_invoice('2'), public.pgtap_whole_crew_visit('2'), false, null),
	(public.pgtap_whole_crew_invoice('3'), public.pgtap_whole_crew_visit('3'), false, null),
	(public.pgtap_whole_crew_invoice('4'), public.pgtap_whole_crew_visit('4'), false, null),
	(public.pgtap_whole_crew_invoice('5'), public.pgtap_whole_crew_visit('5'), false, null),
	(public.pgtap_whole_crew_invoice('6'), public.pgtap_whole_crew_visit('6'), true, null),
	(public.pgtap_whole_crew_invoice('7'), public.pgtap_whole_crew_visit('7'), false, '2026-10-02 12:00+00'),
	(public.pgtap_whole_crew_invoice('7'), public.pgtap_whole_crew_visit('b'), false, null);

set local session_replication_role = origin;


-- Backfill -------------------------------------------------------------------------------------

select is((select row(flagged_count, status_changed_count)::text from private.backfill_whole_crew_status()),
	'(2,5)', 'reports 2 rows flagged and 5 statuses changed');

select is(public.pgtap_whole_crew_state('1'), 'in_progress/clocks',
	'a completed visit a Cleaner never clocked, with no invoice line, reopens unflagged');
select is(public.pgtap_whole_crew_state('2'), 'in_progress/clocks',
	'the same visit on a manual draft reopens');
select is(
	(select count(*)::integer from public.invoice_appointments
	 where invoice_id = public.pgtap_whole_crew_invoice('2') and appointment_id = public.pgtap_whole_crew_visit('2')),
	1, 'the manual draft keeps the reopened visit''s line');
select is(public.pgtap_whole_crew_state('3'), 'completed/manual',
	'the same visit on an issued invoice stays completed, flagged Manual completion');
select is(public.pgtap_whole_crew_state('4'), 'completed/manual',
	'the same visit on a paid invoice stays completed, flagged Manual completion');
select is(public.pgtap_whole_crew_state('5'), 'in_progress/clocks',
	'the same visit whose only line is on a void invoice reopens');
select is(public.pgtap_whole_crew_state('6'), 'in_progress/clocks',
	'the same visit whose only line is released (archived) reopens');
select is(public.pgtap_whole_crew_state('7'), 'in_progress/clocks',
	'the same visit whose only line is Cancelled reopens');
select is(public.pgtap_whole_crew_state('8'), 'completed/manual',
	'a manually completed visit is untouched');
select is(public.pgtap_whole_crew_state('9'), 'cancelled/clocks',
	'a cancelled visit is untouched');
select is(public.pgtap_whole_crew_state('a'), 'completed/clocks',
	'an archived visit is untouched');
select is(public.pgtap_whole_crew_state('b'), 'completed/clocks',
	'a visit whose clocks agree with its status is untouched');
select is(
	(select status from public.invoices where id = public.pgtap_whole_crew_invoice('3'))
		|| '/' || (select status from public.invoices where id = public.pgtap_whole_crew_invoice('4')),
	'issued/paid', 'the issued and paid invoices are untouched');

select is((select row(flagged_count, status_changed_count)::text from private.backfill_whole_crew_status()),
	'(0,0)', 'a second run changes nothing');
select is(public.pgtap_whole_crew_state('3'), 'completed/manual',
	'a second run leaves the flagged visit completed');


select * from finish();

rollback;
