-- invoices.internal_note and invoice_set_internal_note (20261014200500), called as each role.
--
-- Asserts the stored note, the columns it must leave alone and the refusal code (DETAIL) of each
-- refusal, never how the function is written.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a7000000-0000-4000-8000-000000000001', 'pgtap.note.admin@example.test'),
	('a7000000-0000-4000-8000-000000000002', 'pgtap.note.employee@example.test');

insert into public.clients (id, name, automatic_invoicing) values
	('c7000000-0000-4000-8000-000000000001', 'Note Client', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b7000000-0000-4000-8000-000000000001', 'pgTAP Note Job', 4500);

insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
values ('d7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001',
	'b7000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00');

-- 17..01 draft, 17..02 issued (with a line, notes and a due date), 17..03 paid, 17..04 void,
-- 17..05 archived paid that already holds a note.
insert into public.invoices
	(id, client_id, status, invoice_number, issued_date, due_date, paid_date, payment_method, is_archived, notes, internal_note)
values
	('17000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'draft', null, null, null, null, null, false, '', null),
	('17000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'issued', 'INV-901-NOT2026', '2026-10-01', '2026-10-31', null, null, false, 'Thanks for your business', null),
	('17000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'paid', 'INV-902-NOT2026', '2026-10-01', null, '2026-10-02', 'Cash', false, '', null),
	('17000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000001', 'void', 'INV-903-NOT2026', '2026-10-01', null, null, null, false, '', null),
	('17000000-0000-4000-8000-000000000005', 'c7000000-0000-4000-8000-000000000001', 'paid', 'INV-904-NOT2026', '2026-10-01', null, '2026-10-02', 'Cash', true, '', 'Old note');

insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents, billed_rate_cents, billed_minutes)
values ('17000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000001', 9000, 4500, 120);


-- Helpers --------------------------------------------------------------------------------------

-- Runs a statement as the current role and returns the code (DETAIL) it raised, or null.
create function public.pgtap_note_code(statement text) returns text
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

create function public.pgtap_note(invoice uuid) returns text
	language sql
	security definer
	as $$ select internal_note from public.invoices where id = invoice; $$;


-- Schema ---------------------------------------------------------------------------------------

select has_column('public', 'invoices', 'internal_note', 'invoices has an internal_note column');
select col_is_null('public', 'invoices', 'internal_note', 'internal_note is nullable');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000001'), null, 'an invoice written without a note reads NULL');


-- Refusals -------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a7000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(public.pgtap_note_code($$
	select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000001', 'Hi')
$$), 'not_admin', 'an employee can''t set the internal note');

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(public.pgtap_note_code($$
	select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000001', 'Hi')
$$), 'not_admin', 'an anonymous caller can''t set the internal note');

reset role;
select is(public.pgtap_note('17000000-0000-4000-8000-000000000001'), null, 'a refused call writes nothing');

set local role authenticated;
set local request.jwt.claims = '{"sub": "a7000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is(public.pgtap_note_code($$
	select public.invoice_set_internal_note('17000000-0000-4000-8000-0000000000ff', 'Hi')
$$), 'invoice_not_found', 'an unknown invoice is refused with invoice_not_found');


-- Every status, and archived -------------------------------------------------------------------

select lives_ok($$ select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000001', 'Draft note') $$,
	'the admin can set the note on a draft');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000001'), 'Draft note', 'a draft stores the note');

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000002', 'Issued note');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000002'), 'Issued note', 'an issued invoice stores the note');

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000003', 'Paid note');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000003'), 'Paid note', 'a paid invoice stores the note');

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000004', 'Void note');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000004'), 'Void note', 'a void invoice stores the note');

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000005', 'Archived note');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000005'), 'Archived note',
	'an archived invoice stores the note, replacing the old one');


-- Trim and clear -------------------------------------------------------------------------------

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000001', E'  Paid by e-transfer\non Oct 3  ');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000001'), E'Paid by e-transfer\non Oct 3',
	'the note is trimmed at both ends and keeps its inner line break');

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000001', '   ');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000001'), null, 'a whitespace-only note clears it to NULL');

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000002', E'\n\t \r\n');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000002'), null, 'a note of only line breaks and tabs clears it to NULL');

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000003', '');
select is(public.pgtap_note('17000000-0000-4000-8000-000000000003'), null, 'a blank note clears it to NULL');

select public.invoice_set_internal_note('17000000-0000-4000-8000-000000000004', null);
select is(public.pgtap_note('17000000-0000-4000-8000-000000000004'), null, 'a null note clears it to NULL');


-- Nothing else moves ---------------------------------------------------------------------------

reset role;

select results_eq($$
	select status, invoice_number, issued_date, due_date, notes, is_archived from public.invoices
	where id = '17000000-0000-4000-8000-000000000002'
$$, $$
	values ('issued'::text, 'INV-901-NOT2026'::text, '2026-10-01'::date, '2026-10-31'::date,
		'Thanks for your business'::text, false)
$$, 'setting the note leaves the status, number, dates, client notes and archive flag alone');

select results_eq($$
	select appointment_id, billed_amount_cents, billed_rate_cents, billed_minutes, is_archived, cancelled_at
	from public.invoice_appointments where invoice_id = '17000000-0000-4000-8000-000000000002'
$$, $$
	values ('d7000000-0000-4000-8000-000000000001'::uuid, 9000, 4500, 120, false, null::timestamptz)
$$, 'setting the note leaves the invoice''s lines alone');


select * from finish();

rollback;
