-- The appointments_invoicing trigger (20261009140000, join branch removed by 20261017120000): a
-- cancel or a client move follows the visit onto its invoice; a completion or a reopen never
-- creates, joins or leaves an invoice.
--
-- Drives every writer the trigger must cover: employee_clock as an authenticated Cleaner, and
-- direct UPDATEs as postgres for Mark complete / Undo, Cancel, Restore and a client move. Asserts
-- rows in invoices, invoice_appointments and appointments, never how the trigger is written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(30);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a6000000-0000-4000-8000-000000000001', 'pgtap.trigger.admin@example.test'),
	('a6000000-0000-4000-8000-000000000002', 'pgtap.trigger.cleaner@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, address, e_transfer_contact) values
	('e6000000-0000-4000-8000-00000000000a', 'a6000000-0000-4000-8000-000000000002', 'Trigger Cleaner', true, false, '1 A St', 'a@pay.test');

-- c1: the main client. c2: a second client. c3: the target of a client move. c4, c5: one scenario each.
insert into public.clients (id, name) values
	('c6000000-0000-4000-8000-000000000001', 'pgTAP Trigger One'),
	('c6000000-0000-4000-8000-000000000002', 'pgTAP Trigger Two'),
	('c6000000-0000-4000-8000-000000000003', 'pgTAP Trigger Move Target'),
	('c6000000-0000-4000-8000-000000000004', 'pgTAP Trigger Reopen'),
	('c6000000-0000-4000-8000-000000000005', 'pgTAP Trigger Cancel Draft');

insert into public.jobs (id, name, hourly_rate_cents) values
	('b6000000-0000-4000-8000-000000000001', 'pgTAP Trigger Job', 4500);


-- Helpers --------------------------------------------------------------------------------------

-- Visit number n (1-99) for a client, scheduled unless given a status.
create function public.pgtap_trigger_visit(n integer, client uuid, status text default 'scheduled') returns uuid
	language sql
	as $$
	insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, status)
	values (('d6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, client,
		'b6000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00', status)
	returning id;
$$;

create function public.pgtap_trigger_visit_id(n integer) returns uuid
	language sql immutable
	as $$ select ('d6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

-- The Cleaner's assignment on visit n.
create function public.pgtap_trigger_assignment_id(n integer) returns uuid
	language sql immutable
	as $$ select ('f6000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

-- Clocks the Cleaner in and out of visit n as the authenticated Cleaner, as the app does.
create function public.pgtap_trigger_clock_in_and_out(n integer) returns text
	language plpgsql
	as $$
declare
	outcome text;
begin
	perform set_config('request.jwt.claims',
		json_build_object('sub', 'a6000000-0000-4000-8000-000000000002', 'role', 'authenticated')::text, true);
	set local role authenticated;
	outcome := public.employee_clock(public.pgtap_trigger_assignment_id(n), 'in')
		|| '/' || public.employee_clock(public.pgtap_trigger_assignment_id(n), 'out');
	reset role;
	return outcome;
end;
$$;

-- An invoice's lines as sorted visit numbers, e.g. '{1,2}'.
create function public.pgtap_trigger_lines(invoice uuid) returns text
	language sql
	as $$
	select coalesce(array_agg(right(appointment_id::text, 2)::integer order by appointment_id), '{}')::text
	from public.invoice_appointments
	where invoice_id = invoice;
$$;

-- Runs a statement and returns the DETAIL (the invoice error code) it raised, or null.
create function public.pgtap_trigger_code(statement text) returns text
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


-- Completion creates no invoice ----------------------------------------------------------------

select public.pgtap_trigger_visit(n, 'c6000000-0000-4000-8000-000000000001') from generate_series(1, 3) n;
insert into public.appointment_employees (id, appointment_id, employee_id, is_archived)
select public.pgtap_trigger_assignment_id(n), public.pgtap_trigger_visit_id(n), 'e6000000-0000-4000-8000-00000000000a', false
from generate_series(1, 3) n;

select is(public.pgtap_trigger_clock_in_and_out(1), 'clocked/clocked', 'the Cleaner clocks in and out of visit 1');

select is((select status from public.appointments where id = public.pgtap_trigger_visit_id(1)), 'completed',
	'visit 1 is completed once its crew clocked out');
select isnt((select completed_at from public.appointments where id = public.pgtap_trigger_visit_id(1)), null,
	'completing stamps completed_at');
select is_empty($$
	select 1 from public.invoices where client_id = 'c6000000-0000-4000-8000-000000000001'
$$, 'a completion creates no draft');
select is_empty($$
	select 1 from public.invoice_appointments where appointment_id = public.pgtap_trigger_visit_id(1)
$$, 'a completion adds no line');

-- Mark complete and Undo complete: visit 4 has no invoice, visit 5 sits on a manual draft.
select public.pgtap_trigger_visit(4, 'c6000000-0000-4000-8000-000000000004');
select public.pgtap_trigger_visit(5, 'c6000000-0000-4000-8000-000000000004');
insert into public.invoices (id, client_id) values ('16000000-0000-4000-8000-000000000005', 'c6000000-0000-4000-8000-000000000004');
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('16000000-0000-4000-8000-000000000005', public.pgtap_trigger_visit_id(5));

update public.appointments set manually_completed = true
where id in (public.pgtap_trigger_visit_id(4), public.pgtap_trigger_visit_id(5));

select isnt((select completed_at from public.appointments where id = public.pgtap_trigger_visit_id(4)), null,
	'Mark complete stamps completed_at');
select is((select count(*)::integer from public.invoices where client_id = 'c6000000-0000-4000-8000-000000000004'), 1,
	'Mark complete creates no draft beside the manual one');
select is(public.pgtap_trigger_lines('16000000-0000-4000-8000-000000000005'), '{5}',
	'Mark complete leaves the manual draft''s line alone');

update public.appointments set manually_completed = false
where id in (public.pgtap_trigger_visit_id(4), public.pgtap_trigger_visit_id(5));

select is((select status from public.appointments where id = public.pgtap_trigger_visit_id(4)), 'scheduled',
	'Undo complete reopens the visit');
select is(public.pgtap_trigger_lines('16000000-0000-4000-8000-000000000005'), '{5}',
	'a manual draft keeps the reopened visit as an Upcoming line');


-- Cancel ---------------------------------------------------------------------------------------

-- Visit 9: alone on client five's draft.
select public.pgtap_trigger_visit(9, 'c6000000-0000-4000-8000-000000000005', 'completed');
insert into public.invoices (id, client_id) values ('16000000-0000-4000-8000-000000000009', 'c6000000-0000-4000-8000-000000000005');
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('16000000-0000-4000-8000-000000000009', public.pgtap_trigger_visit_id(9));
update public.appointments set status = 'cancelled' where id = public.pgtap_trigger_visit_id(9);

select is_empty($$
	select 1 from public.invoice_appointments where appointment_id = public.pgtap_trigger_visit_id(9)
$$, 'cancelling a visit on a draft deletes its line');
select is_empty($$
	select 1 from public.invoices where client_id = 'c6000000-0000-4000-8000-000000000005'
$$, 'the emptied draft is deleted');

-- Visits 10 and 11 on issued invoice i10; visit 12 on paid invoice i12.
select public.pgtap_trigger_visit(n, 'c6000000-0000-4000-8000-000000000001', 'completed') from generate_series(10, 12) n;
insert into public.invoices (id, client_id, status, invoice_number, issued_date, paid_date, payment_method) values
	('16000000-0000-4000-8000-000000000010', 'c6000000-0000-4000-8000-000000000001', 'issued', 'INV-810-PGT2026', '2026-10-02', null, null),
	('16000000-0000-4000-8000-000000000012', 'c6000000-0000-4000-8000-000000000001', 'paid', 'INV-812-PGT2026', '2026-10-02', '2026-10-03', 'Cash');
insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents) values
	('16000000-0000-4000-8000-000000000010', public.pgtap_trigger_visit_id(10), 9000),
	('16000000-0000-4000-8000-000000000010', public.pgtap_trigger_visit_id(11), 4500),
	('16000000-0000-4000-8000-000000000012', public.pgtap_trigger_visit_id(12), 9000);

update public.appointments set status = 'cancelled' where id = public.pgtap_trigger_visit_id(10);

select isnt((select cancelled_at from public.invoice_appointments where appointment_id = public.pgtap_trigger_visit_id(10)), null,
	'cancelling a visit on an issued invoice makes its line a Cancelled line');
select is(public.pgtap_trigger_lines('16000000-0000-4000-8000-000000000010'), '{10,11}',
	'the Cancelled line stays on the invoice');
select is((select row(status, total_cents)::text from public.invoices_with_status where id = '16000000-0000-4000-8000-000000000010'),
	row('issued', 4500)::text, 'the issued invoice stays issued and its total drops by the cancelled charge');

-- Restore visit 10 so it can be billed again.
update public.appointments set status = 'scheduled' where id = public.pgtap_trigger_visit_id(10);

set local role authenticated;
set local request.jwt.claims = '{"sub": "a6000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select lives_ok($$
	select public.invoice_create_draft('c6000000-0000-4000-8000-000000000001',
		array[public.pgtap_trigger_visit_id(10)], null, 'Rebill', null)
$$, 'the visit of a Cancelled line can be claimed by a new draft');

reset role;

select isnt((select cancelled_at from public.invoice_appointments
	where invoice_id = '16000000-0000-4000-8000-000000000010' and appointment_id = public.pgtap_trigger_visit_id(10)), null,
	'the old Cancelled line is left as it was');

update public.appointments set status = 'cancelled' where id = public.pgtap_trigger_visit_id(11);

select is((select row(status, total_cents, invoice_number)::text from public.invoices_with_status where id = '16000000-0000-4000-8000-000000000010'),
	row('void', 0, 'INV-810-PGT2026')::text, 'cancelling the last uncancelled line voids the invoice, keeping its number');
select is_empty($$
	select 1 from public.invoice_appointments
	where invoice_id = '16000000-0000-4000-8000-000000000010' and not is_archived
$$, 'the voided invoice''s lines are released');

select is(public.pgtap_trigger_code($$
	update public.appointments set status = 'cancelled' where id = public.pgtap_trigger_visit_id(12)
$$), 'invoice_paid', 'cancelling a visit on a paid invoice is refused');
select is((select status from public.appointments where id = public.pgtap_trigger_visit_id(12)), 'completed',
	'the visit on the paid invoice stays uncancelled');
select is((select cancelled_at from public.invoice_appointments where appointment_id = public.pgtap_trigger_visit_id(12)), null,
	'the paid invoice''s line is untouched');


-- Restore into completed -----------------------------------------------------------------------

-- Visit 13 is manually completed, so Restore derives completed. Visit 14 keeps i13 issued.
select public.pgtap_trigger_visit(n, 'c6000000-0000-4000-8000-000000000001', 'completed') from generate_series(13, 14) n;
update public.appointments set manually_completed = true where id = public.pgtap_trigger_visit_id(13);
insert into public.invoices (id, client_id, status, invoice_number, issued_date) values
	('16000000-0000-4000-8000-000000000013', 'c6000000-0000-4000-8000-000000000001', 'issued', 'INV-813-PGT2026', '2026-10-02');
insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents) values
	('16000000-0000-4000-8000-000000000013', public.pgtap_trigger_visit_id(13), 9000),
	('16000000-0000-4000-8000-000000000013', public.pgtap_trigger_visit_id(14), 9000);

update public.appointments set status = 'cancelled' where id = public.pgtap_trigger_visit_id(13);
update public.appointments set status = 'scheduled' where id = public.pgtap_trigger_visit_id(13);

select is((select status from public.appointments where id = public.pgtap_trigger_visit_id(13)), 'completed',
	'Restore derives completed for the manually completed visit');
select is((select count(*)::integer from public.invoices
	where client_id = 'c6000000-0000-4000-8000-000000000001' and status = 'draft' and not is_archived), 1,
	'restoring a completed visit creates no draft: only the Rebill draft made by hand is open');
select is(
	(select row(cancelled_at is not null, is_archived)::text from public.invoice_appointments
	 where invoice_id = '16000000-0000-4000-8000-000000000013' and appointment_id = public.pgtap_trigger_visit_id(13)),
	row(true, false)::text, 'its old Cancelled line is untouched');


-- Client move ----------------------------------------------------------------------------------

select public.pgtap_trigger_visit(15, 'c6000000-0000-4000-8000-000000000001');
insert into public.invoices (id, client_id) values ('16000000-0000-4000-8000-000000000015', 'c6000000-0000-4000-8000-000000000001');
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('16000000-0000-4000-8000-000000000015', public.pgtap_trigger_visit_id(15));

update public.appointments set client_id = 'c6000000-0000-4000-8000-000000000003' where id = public.pgtap_trigger_visit_id(15);

select is_empty($$
	select 1 from public.invoices where id = '16000000-0000-4000-8000-000000000015'
$$, 'moving a visit to another client removes its draft line and deletes the emptied draft');

select is(public.pgtap_trigger_code($$
	update public.appointments set client_id = 'c6000000-0000-4000-8000-000000000003' where id = public.pgtap_trigger_visit_id(14)
$$), 'invoice_issued', 'moving a visit on an issued invoice is refused');
select is(public.pgtap_trigger_code($$
	update public.appointments set client_id = 'c6000000-0000-4000-8000-000000000003' where id = public.pgtap_trigger_visit_id(12)
$$), 'invoice_paid', 'moving a visit on a paid invoice is refused');
select is((select count(*)::integer from public.appointments
	where id in (public.pgtap_trigger_visit_id(12), public.pgtap_trigger_visit_id(14))
		and client_id = 'c6000000-0000-4000-8000-000000000001'), 2,
	'the refused moves leave the visits with their client');

update public.appointments set notes = 'touched', client_id = client_id, status = status
where id = public.pgtap_trigger_visit_id(14);

select is((select cancelled_at from public.invoice_appointments where appointment_id = public.pgtap_trigger_visit_id(14)), null,
	'an update that changes neither status nor client leaves billing alone');


select * from finish();

rollback;
