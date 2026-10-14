-- invoice_create_draft's p_internal_note (20261014210000), called as an authenticated admin.
--
-- Asserts the Internal note stored on the new draft: trimmed, and NULL when blank or null. The
-- refusals and lines of invoice_create_draft are pinned in invoice_drafts.test.sql.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a8000000-0000-4000-8000-000000000001', 'pgtap.create-note.admin@example.test');

insert into public.clients (id, name, automatic_invoicing) values
	('c8000000-0000-4000-8000-000000000001', 'pgTAP Create Note Client', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b8000000-0000-4000-8000-000000000001', 'pgTAP Create Note Job', 4500);

-- One Upcoming visit per draft created below.
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
values
	('d8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00'),
	('d8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-10-02', '09:00', '11:00'),
	('d8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-10-03', '09:00', '11:00'),
	('d8000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001', '2026-10-04', '09:00', '11:00');


-- Helpers --------------------------------------------------------------------------------------

-- Creates a draft for one visit as the admin and returns its Internal note, read back as postgres.
create function public.pgtap_create_note(visit uuid, note text) returns text
	language plpgsql
	as $$
declare
	new_invoice_id uuid;
	stored_note text;
begin
	set local role authenticated;
	set local request.jwt.claims = '{"sub": "a8000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';
	new_invoice_id := public.invoice_create_draft('c8000000-0000-4000-8000-000000000001', array[visit], null, 'Thanks!', note);
	reset role;

	select internal_note into stored_note from public.invoices where id = new_invoice_id;
	return stored_note;
end;
$$;


-- Stored note ----------------------------------------------------------------------------------

select is(public.pgtap_create_note('d8000000-0000-4000-8000-000000000001', 'Client asked for a separate October invoice'),
	'Client asked for a separate October invoice', 'a new draft stores its Internal note');

select is(public.pgtap_create_note('d8000000-0000-4000-8000-000000000002', E'  Paid by e-transfer\non Oct 3 \n'),
	E'Paid by e-transfer\non Oct 3', 'the note is trimmed at both ends and keeps its inner line break');

select is(public.pgtap_create_note('d8000000-0000-4000-8000-000000000003', E' \n\t '),
	null, 'a blank note is stored as NULL');

select is(public.pgtap_create_note('d8000000-0000-4000-8000-000000000004', null),
	null, 'a null note is stored as NULL');

select is((select count(*)::integer from public.invoices
	where client_id = 'c8000000-0000-4000-8000-000000000001' and status = 'draft' and notes = 'Thanks!'),
	4, 'each call creates its draft with the client notes as sent');


select * from finish();

rollback;
