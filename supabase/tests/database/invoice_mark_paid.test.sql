-- Mark paid (invoice_mark_paid, 20261011160000; Internal note 20261014220000), called as the admin.
--
-- Asserts the refusal code (DETAIL) of every refusal and their order, the rows a Mark paid leaves
-- (the new paid invoice, its lines, the drafts it pulls appointments off, payment_methods) and
-- that the ordinary undo payment and void work on it. Business dates are
-- (now() at time zone 'America/New_York')::date, as in invoice_transitions.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(48);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a6100000-0000-4000-8000-000000000001', 'pgtap.markpaid.admin@example.test'),
	('a6100000-0000-4000-8000-000000000002', 'pgtap.markpaid.employee@example.test');

-- Automatic invoicing off, so completing a visit opens no Automatic draft of its own.
insert into public.clients (id, name, automatic_invoicing) values
	('c6100000-0000-4000-8000-000000000001', 'Smith', false),
	('c6100000-0000-4000-8000-000000000002', 'Other', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b6100000-0000-4000-8000-000000000001', 'pgTAP Job', 4500);

-- d01..d20, all Smith's except d07 (Other's).
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
select ('d6100000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
	case when n = 7 then 'c6100000-0000-4000-8000-000000000002' else 'c6100000-0000-4000-8000-000000000001' end::uuid,
	'b6100000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00'
from generate_series(1, 20) n;

-- Completed (Manual completion): all but d05 (still scheduled) and d06 (cancelled below).
update public.appointments set manually_completed = true, status = 'completed'
where id <> 'd6100000-0000-4000-8000-000000000005' and id <> 'd6100000-0000-4000-8000-000000000006';

update public.appointments set status = 'cancelled' where id = 'd6100000-0000-4000-8000-000000000006';
update public.appointments set is_archived = true where id = 'd6100000-0000-4000-8000-000000000008';

delete from public.invoice_number_counters;

-- 16..01 draft holding only d02; 16..02 Automatic draft holding d03 and d04; 16..03 issued (d09);
-- 16..04 paid (d10); 16..05 draft (d12) issued below to share the number count.
insert into public.invoices (id, client_id, status, is_automatic, invoice_number, issued_date, paid_date, payment_method) values
	('16000000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000001', 'draft', false, null, null, null, null),
	('16000000-0000-4000-8000-000000000002', 'c6100000-0000-4000-8000-000000000001', 'draft', true, null, null, null, null),
	('16000000-0000-4000-8000-000000000003', 'c6100000-0000-4000-8000-000000000001', 'issued', false, 'INV-900-SMI2026', '2026-10-01', null, null),
	('16000000-0000-4000-8000-000000000004', 'c6100000-0000-4000-8000-000000000001', 'paid', false, 'INV-901-SMI2026', '2026-10-01', '2026-10-02', 'Cash'),
	('16000000-0000-4000-8000-000000000005', 'c6100000-0000-4000-8000-000000000001', 'draft', false, null, null, null, null);

insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents) values
	('16000000-0000-4000-8000-000000000001', 'd6100000-0000-4000-8000-000000000002', null),
	('16000000-0000-4000-8000-000000000002', 'd6100000-0000-4000-8000-000000000003', null),
	('16000000-0000-4000-8000-000000000002', 'd6100000-0000-4000-8000-000000000004', null),
	('16000000-0000-4000-8000-000000000003', 'd6100000-0000-4000-8000-000000000009', 9000),
	('16000000-0000-4000-8000-000000000004', 'd6100000-0000-4000-8000-000000000010', 9000),
	('16000000-0000-4000-8000-000000000005', 'd6100000-0000-4000-8000-000000000012', null);


-- Helpers --------------------------------------------------------------------------------------

-- Runs a statement as the current role and returns the code (DETAIL) it raised, or null.
create function public.pgtap_mark_paid_refusal(statement text) returns text
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

-- A Mark paid of the given visits (dNN numbers) at $50.00 each, paid today in Cash.
create function public.pgtap_mark_paid_call(variadic numbers int[]) returns text
	language sql
	as $$
	select format('select public.invoice_mark_paid(%L, %L, null, %L, null, null)',
		'c6100000-0000-4000-8000-000000000001',
		(select jsonb_agg(jsonb_build_object(
			'appointment_id', 'd6100000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'),
			'billed_amount_cents', 5000))
		from unnest(numbers) n),
		'Cash');
$$;

create function public.pgtap_mark_paid_today() returns date
	language sql
	as $$ select (now() at time zone 'America/New_York')::date; $$;

create function public.pgtap_mark_paid_year() returns text
	language sql
	as $$ select extract(year from public.pgtap_mark_paid_today())::text; $$;


-- Refusals, in order ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a6100000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001', '[]', null, '', null, null)
$$), 'not_admin', 'an employee gets not_admin before any other refusal');

set local request.jwt.claims = '{"sub": "a6100000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001', '[]', null, '', null, null)
$$), 'empty_lines', 'no lines is empty_lines, before the blank method');

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001', null, null, 'Cash', null, null)
$$), 'empty_lines', 'null lines is empty_lines');

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000099',
		'[{"appointment_id": "d6100000-0000-4000-8000-000000000001", "billed_amount_cents": 5000}]', null, 'Cash', null, null)
$$), 'visit_other_client', 'an unknown client is visit_other_client');

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001',
		'[{"appointment_id": "d6100000-0000-4000-8000-000000000099", "billed_amount_cents": 5000}]', null, 'Cash', null, null)
$$), 'visit_other_client', 'an unknown appointment is visit_other_client');

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001',
		'[{"appointment_id": "not-a-uuid", "billed_amount_cents": 5000}]', null, 'Cash', null, null)
$$), 'visit_other_client', 'a malformed appointment id is visit_other_client, not a cast error');

select is(public.pgtap_mark_paid_refusal(public.pgtap_mark_paid_call(8)),
	'visit_other_client', 'an archived appointment is visit_other_client');

select is(public.pgtap_mark_paid_refusal(public.pgtap_mark_paid_call(6, 7)),
	'visit_other_client', 'another client''s appointment is visit_other_client, before visit_cancelled');

select is(public.pgtap_mark_paid_refusal(public.pgtap_mark_paid_call(6, 10)),
	'visit_cancelled', 'a cancelled appointment is visit_cancelled, before invoice_paid');

select is(public.pgtap_mark_paid_refusal(public.pgtap_mark_paid_call(9, 10)),
	'invoice_paid', 'an appointment on a paid invoice is invoice_paid, before invoice_issued');

select is(public.pgtap_mark_paid_refusal(format('select public.invoice_mark_paid(%L, %L, null, %L, null, null)',
	'c6100000-0000-4000-8000-000000000001',
	'[{"appointment_id": "d6100000-0000-4000-8000-000000000009", "billed_amount_cents": 5000},
	  {"appointment_id": "d6100000-0000-4000-8000-000000000001", "billed_amount_cents": -1}]', 'Cash')),
	'invoice_issued', 'an appointment on an issued invoice is invoice_issued, before unpriced_line');

select is_empty($$
	select amount
	from unnest(array['null', '-1', '12.5', '"5000"']) amount
	where public.pgtap_mark_paid_refusal(format('select public.invoice_mark_paid(%L, %L, %L, %L, null, null)',
		'c6100000-0000-4000-8000-000000000001',
		'[{"appointment_id": "d6100000-0000-4000-8000-000000000001", "billed_amount_cents": ' || amount || '}]',
		public.pgtap_mark_paid_today() + 1, '')) is distinct from 'unpriced_line'
$$, 'a missing, negative, fractional or string amount is unpriced_line, before paid_date_future');

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001',
		'[{"appointment_id": "d6100000-0000-4000-8000-000000000001"}]', null, 'Cash', null, null)
$$), 'unpriced_line', 'a line with no amount at all is unpriced_line');

select is(public.pgtap_mark_paid_refusal(format('select public.invoice_mark_paid(%L, %L, %L, %L, null, null)',
	'c6100000-0000-4000-8000-000000000001',
	'[{"appointment_id": "d6100000-0000-4000-8000-000000000001", "billed_amount_cents": 5000}]',
	public.pgtap_mark_paid_today() + 1, '  ')),
	'paid_date_future', 'a paid date after today is paid_date_future, before method_required');

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001',
		'[{"appointment_id": "d6100000-0000-4000-8000-000000000001", "billed_amount_cents": 5000}]', null, E' \t ', null, null)
$$), 'method_required', 'a blank method is method_required');

reset role;

select results_eq($$
	select count(*)::int, (select count(*)::int from public.invoice_appointments where invoice_id = '16000000-0000-4000-8000-000000000001')
	from public.invoices where client_id = 'c6100000-0000-4000-8000-000000000001'
$$, $$ values (5, 1) $$, 'the refused calls wrote no invoice and left the drafts as they were');


-- Number count shared with issued invoices ------------------------------------------------------

set local role authenticated;

select is(public.invoice_issue('16000000-0000-4000-8000-000000000005',
	'[{"appointment_id": "d6100000-0000-4000-8000-000000000012", "billed_amount_cents": 1000}]', null),
	'INV-001-SMI' || public.pgtap_mark_paid_year(), 'an ordinary issue takes the first number of the year');


-- Mark paid ------------------------------------------------------------------------------------

-- d01 plain, d02 off its only-line draft, d03 off a two-line Automatic draft, d05 still scheduled.
create temporary table pgtap_mark_paid_result on commit drop as
select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001',
	'[{"appointment_id": "d6100000-0000-4000-8000-000000000001", "billed_amount_cents": 9000},
	  {"appointment_id": "d6100000-0000-4000-8000-000000000002", "billed_amount_cents": 4500},
	  {"appointment_id": "d6100000-0000-4000-8000-000000000003", "billed_amount_cents": 2500},
	  {"appointment_id": "d6100000-0000-4000-8000-000000000005", "billed_amount_cents": 1000},
	  {"appointment_id": "d6100000-0000-4000-8000-000000000001", "billed_amount_cents": 9000}]',
	null, E'  Barter \t trade ', '  ref 42  ', E' \n Gate code 4471\nSide door \t \n') as result;

reset role;

select is((select result ->> 'invoice_number' from pgtap_mark_paid_result),
	'INV-002-SMI' || public.pgtap_mark_paid_year(), 'Mark paid returns the next number in the count issued invoices use');

select results_eq($$
	select client_id, status, is_automatic, is_archived, invoice_number, issued_date, due_date, paid_date, payment_method, payment_reference
	from public.invoices where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_result)
$$, $$
	values ('c6100000-0000-4000-8000-000000000001'::uuid, 'paid'::text, false, false,
		'INV-002-SMI' || public.pgtap_mark_paid_year(), public.pgtap_mark_paid_today(), null::date,
		public.pgtap_mark_paid_today(), 'Barter trade'::text, 'ref 42'::text)
$$, 'the new invoice is paid, manual, issued and paid today with no due date, the method normalised and the reference trimmed');

select is((select internal_note from public.invoices where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_result)),
	E'Gate code 4471\nSide door', 'the Internal note is stored on the new invoice, trimmed of edge whitespace and line breaks');

select results_eq($$
	select appointment_id, billed_amount_cents, billed_rate_cents, billed_minutes, is_archived, cancelled_at
	from public.invoice_appointments where invoice_id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_result)
	order by appointment_id
$$, $$
	values ('d6100000-0000-4000-8000-000000000001'::uuid, 9000, null::integer, null::integer, false, null::timestamptz),
		('d6100000-0000-4000-8000-000000000002'::uuid, 4500, null::integer, null::integer, false, null::timestamptz),
		('d6100000-0000-4000-8000-000000000003'::uuid, 2500, null::integer, null::integer, false, null::timestamptz),
		('d6100000-0000-4000-8000-000000000005'::uuid, 1000, null::integer, null::integer, false, null::timestamptz)
$$, 'one line per distinct appointment with its Billed amount and no rate or minutes');

select is((select status from public.appointments where id = 'd6100000-0000-4000-8000-000000000005'),
	'scheduled', 'the scheduled appointment stays scheduled: its line is an Upcoming line');

select results_eq($$
	select status, total_cents from public.invoices_with_status
	where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_result)
$$, $$ values ('paid'::text, 17000) $$, 'invoices_with_status shows it paid with the sum of its Billed amounts');

select is((select count(*)::int from public.invoices where id = '16000000-0000-4000-8000-000000000001'),
	0, 'the draft left with no live line is deleted');

select results_eq($$
	select appointment_id from public.invoice_appointments where invoice_id = '16000000-0000-4000-8000-000000000002'
$$, $$ values ('d6100000-0000-4000-8000-000000000004'::uuid) $$, 'the other draft loses only the marked appointment''s line');

select results_eq($$
	select status, is_automatic from public.invoices where id = '16000000-0000-4000-8000-000000000002'
$$, $$ values ('draft'::text, true) $$, 'the rest of that draft is untouched, still an Automatic draft');

select is((select bool_or(excluded_from_automatic) from public.appointments
	where id in ('d6100000-0000-4000-8000-000000000002', 'd6100000-0000-4000-8000-000000000003')),
	false, 'leaving a draft through Mark paid doesn''t make the appointment Excluded');

select results_eq($$
	select name, is_hidden from public.payment_methods where name = 'Barter trade'
$$, $$ values ('Barter trade'::text, false) $$, 'an unknown method joins payment_methods, unhidden');

select is((select sort_order from public.payment_methods where name = 'Barter trade'),
	(select max(sort_order) from public.payment_methods), 'the new method sorts last');


-- Matching an existing method, $0 line, paid date ----------------------------------------------

set local role authenticated;

create temporary table pgtap_mark_paid_zero on commit drop as
select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001',
	'[{"appointment_id": "d6100000-0000-4000-8000-000000000011", "billed_amount_cents": 0}]',
	public.pgtap_mark_paid_today() - 3, 'BARTER TRADE', '   ', E' \r\n \t ') as result;

reset role;

select results_eq($$
	select invoice_number, paid_date, payment_method, payment_reference
	from public.invoices where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_zero)
$$, $$
	values ('INV-003-SMI' || public.pgtap_mark_paid_year(), public.pgtap_mark_paid_today() - 3, 'Barter trade'::text, null::text)
$$, 'a past paid date is kept, a method in another case is stored as the listed name and a blank reference is null');

select is((select internal_note from public.invoices where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_zero)),
	null, 'a blank Internal note is stored as null');

select is((select count(*)::int from public.payment_methods where lower(name) = 'barter trade'),
	1, 'reusing a method in another case adds no row');

select results_eq($$
	select status, total_cents from public.invoices_with_status
	where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_zero)
$$, $$ values ('paid'::text, 0) $$, 'a $0 line is accepted and the invoice totals $0');

select is(public.pgtap_mark_paid_refusal(public.pgtap_mark_paid_call(1)),
	'invoice_paid', 'marking an appointment already marked paid is invoice_paid');


-- Not issued again later -----------------------------------------------------------------------

-- With Automatic invoicing on, a completion joins the Automatic draft unless it has a Live claim.
update public.clients set automatic_invoicing = true where id = 'c6100000-0000-4000-8000-000000000001';
update public.appointments set status = 'completed', manually_completed = true where id = 'd6100000-0000-4000-8000-000000000005';
update public.clients set automatic_invoicing = false where id = 'c6100000-0000-4000-8000-000000000001';

select is((select count(*)::int from public.invoice_appointments where appointment_id = 'd6100000-0000-4000-8000-000000000005'),
	1, 'completing the Upcoming appointment later leaves it on the paid invoice only');


-- Undo payment, then void ----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a6100000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select lives_ok(format('select public.invoice_undo_payment(%L)', (select result ->> 'invoice_id' from pgtap_mark_paid_result)),
	'the ordinary undo payment works on a Mark paid invoice');

reset role;

select results_eq($$
	select status, paid_date, payment_method, payment_reference from public.invoices
	where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_result)
$$, $$ values ('issued'::text, null::date, null::text, null::text) $$, 'undoing the payment leaves it issued with no Payment');

set local role authenticated;

select lives_ok(format('select public.invoice_void(%L)', (select result ->> 'invoice_id' from pgtap_mark_paid_result)),
	'the ordinary void works on it afterwards');

reset role;

select is((select status from public.invoices where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_result)),
	'void', 'the invoice is void');

select is((select bool_and(is_archived) from public.invoice_appointments
	where invoice_id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_result)),
	true, 'voiding releases every line');

set local role authenticated;

create temporary table pgtap_mark_paid_again on commit drop as
select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001',
	'[{"appointment_id": "d6100000-0000-4000-8000-000000000001", "billed_amount_cents": 9000}]', null, 'Cash', null, null) as result;

reset role;

select is((select result ->> 'invoice_number' from pgtap_mark_paid_again),
	'INV-004-SMI' || public.pgtap_mark_paid_year(), 'a released appointment can be marked paid again, under a new number');

select is((select internal_note from public.invoices where id = (select (result ->> 'invoice_id')::uuid from pgtap_mark_paid_again)),
	null, 'a null Internal note is stored as null');


-- Issue still numbers after Mark paid ----------------------------------------------------------

insert into public.invoices (id, client_id) values
	('16000000-0000-4000-8000-000000000006', 'c6100000-0000-4000-8000-000000000001');
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('16000000-0000-4000-8000-000000000006', 'd6100000-0000-4000-8000-000000000013');

set local role authenticated;

select is(public.invoice_issue('16000000-0000-4000-8000-000000000006',
	'[{"appointment_id": "d6100000-0000-4000-8000-000000000013", "billed_amount_cents": 1000}]', null),
	'INV-005-SMI' || public.pgtap_mark_paid_year(), 'the next ordinary issue continues the shared count');

reset role;


-- The SECURITY DEFINER contract ------------------------------------------------------------------

select is((select prosecdef from pg_proc where oid = 'public.invoice_mark_paid(uuid, jsonb, date, text, text, text)'::regprocedure),
	true, 'invoice_mark_paid runs as its owner');

select is((select pg_get_userbyid(proowner) from pg_proc where oid = 'public.invoice_mark_paid(uuid, jsonb, date, text, text, text)'::regprocedure),
	'postgres', 'invoice_mark_paid is owned by postgres');

select ok(has_function_privilege('authenticated', 'public.invoice_mark_paid(uuid, jsonb, date, text, text, text)', 'execute'),
	'authenticated can call invoice_mark_paid (it refuses non-admins itself)');

select ok(has_function_privilege('anon', 'public.invoice_mark_paid(uuid, jsonb, date, text, text, text)', 'execute'),
	'anon keeps EXECUTE like the other invoice functions (ADR 0001)');

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select is(public.pgtap_mark_paid_refusal($$
	select public.invoice_mark_paid('c6100000-0000-4000-8000-000000000001', '[]', null, 'Cash', null, null)
$$), 'not_admin', 'an anonymous caller gets not_admin');

reset role;


select * from finish();

rollback;
