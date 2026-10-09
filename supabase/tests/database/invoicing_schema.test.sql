-- The invoicing schema (20261009130000): the rules the tables, view, helpers and grants enforce.
--
-- Covers the Automatic draft index, the Live claim index, the invoice CHECKs, the derived total
-- on invoices_with_status, invoice_error's contract, the anon grants and payment_methods access.
-- The overdue rule lives in invoices_with_status_business_date.test.sql.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(63);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test');

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000001', 'pgTAP Client One'),
	('c0000000-0000-4000-8000-000000000002', 'pgTAP Client Two');

insert into public.jobs (id, name, hourly_rate_cents) values
	('b0000000-0000-4000-8000-000000000001', 'pgTAP Job', 4500);

insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
select ('d0000000-0000-4000-8000-00000000000' || n)::uuid, 'c0000000-0000-4000-8000-000000000001',
	'b0000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00'
from generate_series(1, 5) n;


-- Helpers --------------------------------------------------------------------------------------

-- Runs a statement and returns what it raised (sqlstate, message, detail), or null if it didn't.
create function public.pgtap_raised(statement text) returns text[]
	language plpgsql
	as $$
declare
	raised_state text;
	raised_message text;
	raised_detail text;
begin
	execute statement;
	return null;
exception when others then
	get stacked diagnostics raised_state = returned_sqlstate, raised_message = message_text,
		raised_detail = pg_exception_detail;
	return array[raised_state, raised_message, raised_detail];
end;
$$;


-- Shape ----------------------------------------------------------------------------------------

select col_default_is('public', 'clients', 'automatic_invoicing', 'true',
	'clients.automatic_invoicing defaults to on');
select col_default_is('public', 'appointments', 'excluded_from_automatic', 'false',
	'appointments.excluded_from_automatic defaults to off');
select col_is_null('public', 'appointments', 'completed_at', 'appointments.completed_at is nullable');
select hasnt_column('public', 'appointments', 'billed_price_cents', 'appointments.billed_price_cents is gone');
select hasnt_column('public', 'invoices', 'total_cents', 'invoices.total_cents is gone (derived in the view)');
select col_is_null('public', 'invoice_appointments', 'billed_amount_cents',
	'invoice_appointments.billed_amount_cents is nullable (drafts store no price)');


-- One Automatic draft per client ---------------------------------------------------------------

select lives_ok($$
	insert into public.invoices (id, client_id, is_automatic) values
		('10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', true)
$$, 'a client gets an Automatic draft');

select throws_ok($$
	insert into public.invoices (client_id, is_automatic) values ('c0000000-0000-4000-8000-000000000001', true)
$$, '23505', null, 'a second Automatic draft for the same client is refused');

select lives_ok($$
	insert into public.invoices (client_id, is_automatic) values ('c0000000-0000-4000-8000-000000000001', false)
$$, 'a manual draft beside the Automatic draft is allowed');

select lives_ok($$
	insert into public.invoices (client_id, is_automatic) values ('c0000000-0000-4000-8000-000000000002', true)
$$, 'another client gets its own Automatic draft');

update public.invoices set status = 'issued', invoice_number = 'INV-001-PGT2026', issued_date = '2026-10-01'
where id = '10000000-0000-4000-8000-000000000001';

select lives_ok($$
	insert into public.invoices (id, client_id, is_automatic) values
		('10000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', true)
$$, 'once the Automatic draft is issued, the next one may start');

update public.invoices set is_archived = true where id = '10000000-0000-4000-8000-000000000002';

select lives_ok($$
	insert into public.invoices (client_id, is_automatic) values ('c0000000-0000-4000-8000-000000000001', true)
$$, 'once the Automatic draft is archived, the next one may start');


-- One Live claim per appointment ---------------------------------------------------------------

insert into public.invoices (id, client_id) values
	('20000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
	('20000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001'),
	('20000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001');

select lives_ok($$
	insert into public.invoice_appointments (invoice_id, appointment_id) values
		('20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001')
$$, 'a draft line with no price claims the visit');

select throws_ok($$
	insert into public.invoice_appointments (invoice_id, appointment_id) values
		('20000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001')
$$, '23505', null, 'a second Live claim on the same visit is refused');

update public.invoice_appointments set is_archived = true
where invoice_id = '20000000-0000-4000-8000-000000000001';

select lives_ok($$
	insert into public.invoice_appointments (invoice_id, appointment_id) values
		('20000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001')
$$, 'a released line no longer claims the visit');

update public.invoice_appointments set cancelled_at = now()
where invoice_id = '20000000-0000-4000-8000-000000000002';

select lives_ok($$
	insert into public.invoice_appointments (invoice_id, appointment_id) values
		('20000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001')
$$, 'a Cancelled line no longer claims the visit');

select throws_ok($$
	insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents, billed_rate_cents) values
		('20000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 9000, 4500)
$$, '23514', null, 'a line with a rate but no minutes is still refused');


-- Invoice CHECKs -------------------------------------------------------------------------------

select throws_ok($$
	insert into public.invoices (client_id, invoice_number) values ('c0000000-0000-4000-8000-000000000002', 'INV-900-PGT2026')
$$, '23514', null, 'a draft can''t carry an Invoice number');

select throws_ok($$
	insert into public.invoices (client_id, status, issued_date) values ('c0000000-0000-4000-8000-000000000002', 'issued', '2026-10-01')
$$, '23514', null, 'an issued invoice needs an Invoice number');

select throws_ok($$
	insert into public.invoices (client_id, status, invoice_number) values ('c0000000-0000-4000-8000-000000000002', 'issued', 'INV-901-PGT2026')
$$, '23514', null, 'an issued invoice needs an issued date');

select throws_ok($$
	insert into public.invoices (client_id, issued_date) values ('c0000000-0000-4000-8000-000000000002', '2026-10-01')
$$, '23514', null, 'a draft can''t carry an issued date');

select throws_ok($$
	insert into public.invoices (client_id, status, invoice_number, issued_date, due_date)
	values ('c0000000-0000-4000-8000-000000000002', 'issued', 'INV-902-PGT2026', '2026-10-01', '2026-09-30')
$$, '23514', null, 'a due date before the issued date is refused');

select lives_ok($$
	insert into public.invoices (client_id, status, invoice_number, issued_date, due_date)
	values ('c0000000-0000-4000-8000-000000000002', 'issued', 'INV-903-PGT2026', '2026-10-01', '2026-10-01')
$$, 'a due date on the issued date is allowed');

select throws_ok($$
	insert into public.invoices (client_id, status, invoice_number, issued_date)
	values ('c0000000-0000-4000-8000-000000000002', 'paid', 'INV-904-PGT2026', '2026-10-01')
$$, '23514', null, 'a paid invoice needs a paid date and a method');

select throws_ok($$
	insert into public.invoices (client_id, status, invoice_number, issued_date, paid_date)
	values ('c0000000-0000-4000-8000-000000000002', 'paid', 'INV-905-PGT2026', '2026-10-01', '2026-10-02')
$$, '23514', null, 'a paid invoice with a date but no method is refused');

select throws_ok($$
	insert into public.invoices (client_id, status, invoice_number, issued_date, paid_date, payment_method)
	values ('c0000000-0000-4000-8000-000000000002', 'issued', 'INV-906-PGT2026', '2026-10-01', '2026-10-02', 'Cash')
$$, '23514', null, 'an invoice that is not paid can''t carry a Payment');

select lives_ok($$
	insert into public.invoices (client_id, status, invoice_number, issued_date, paid_date, payment_method)
	values ('c0000000-0000-4000-8000-000000000002', 'paid', 'INV-907-PGT2026', '2026-10-01', '2026-10-02', 'Cash')
$$, 'a paid invoice with a paid date and a method is allowed');

select lives_ok($$
	insert into public.invoices (client_id, status, invoice_number, issued_date)
	values ('c0000000-0000-4000-8000-000000000002', 'void', 'INV-908-PGT2026', '2026-10-01')
$$, 'a void invoice keeps its Invoice number');

select throws_ok($$
	insert into public.invoices (client_id, status, issued_date) values ('c0000000-0000-4000-8000-000000000002', 'void', '2026-10-01')
$$, '23514', null, 'a void invoice can''t lose its Invoice number');

select throws_ok($$
	insert into public.invoices (client_id, status, invoice_number, issued_date)
	values ('c0000000-0000-4000-8000-000000000002', 'issued', 'INV-001-PGT2026', '2026-10-01')
$$, '23505', null, 'an Invoice number is never reused');


-- Derived total --------------------------------------------------------------------------------

insert into public.invoices (id, client_id, status, invoice_number, issued_date) values
	('30000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'issued', 'INV-910-PGT2026', '2026-10-01'),
	('30000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'issued', 'INV-911-PGT2026', '2026-10-01');
insert into public.invoices (id, client_id) values
	('30000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001'),
	('30000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001');

insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents, is_archived, cancelled_at) values
	('30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 1000, false, null),
	('30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', 2500, false, null),
	('30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004', 700, false, now()),
	('30000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005', 400, true, null),
	('30000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000005', null, false, null);

select is((select total_cents from public.invoices_with_status where id = '30000000-0000-4000-8000-000000000001'),
	3500, 'the total sums live lines and skips Cancelled and released ones');
select is((select total_cents from public.invoices_with_status where id = '30000000-0000-4000-8000-000000000002'),
	0, 'an invoice with no lines totals 0');
select is((select total_cents from public.invoices_with_status where id = '30000000-0000-4000-8000-000000000003'),
	0, 'a draft whose lines have no price yet totals 0');

-- A void invoice keeps its original total: the lines its void released still count.
insert into public.invoices (id, client_id, status, invoice_number, issued_date) values
	('30000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'void', 'INV-912-PGT2026', '2026-10-01');
insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents, is_archived, cancelled_at) values
	('30000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000002', 1200, true, null),
	('30000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000003', 800, true, null),
	('30000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000004', 300, true, now());

select is((select total_cents from public.invoices_with_status where id = '30000000-0000-4000-8000-000000000005'),
	2000, 'a void invoice totals its released lines and still skips Cancelled ones');


-- invoice_error --------------------------------------------------------------------------------

select throws_ok($$ select public.invoice_error('draft_changed') $$, 'P0001',
	'The draft changed since you opened it. Reload it and try again.',
	'invoice_error raises P0001 with a readable message');
select is((public.pgtap_raised($$ select public.invoice_error('draft_changed') $$))[3],
	'draft_changed', 'invoice_error puts the code in DETAIL');

select is_empty($$
	select code
	from unnest(array[
		'not_admin', 'invoice_not_found', 'invalid_status', 'archived_invoice', 'draft_changed',
		'unpriced_line', 'empty_lines', 'due_before_issue', 'paid_date_future', 'method_required',
		'visit_claimed', 'visit_cancelled', 'visit_other_client', 'invoice_paid', 'invoice_issued'
	]) code
	cross join lateral (select public.pgtap_raised(format('select public.invoice_error(%L)', code)) raised) r
	where r.raised[1] is distinct from 'P0001'
		or r.raised[3] is distinct from code
		or coalesce(r.raised[2], '') in ('', code)
		or r.raised[2] like 'Unknown invoice error%'
$$, 'every listed code raises P0001 with its own DETAIL and a readable message');

select is((public.pgtap_raised($$ select public.invoice_error('no_such_code') $$))[3],
	'unknown_invoice_error', 'an unknown code raises unknown_invoice_error');
select is((public.pgtap_raised($$ select public.invoice_error('no_such_code') $$))[1],
	'P0001', 'an unknown code still raises P0001');


-- Grants ---------------------------------------------------------------------------------------

select table_privs_are('public', 'invoices', 'anon', '{}'::text[], 'anon has no privilege on invoices');
select table_privs_are('public', 'invoice_appointments', 'anon', '{}'::text[], 'anon has no privilege on invoice_appointments');
select table_privs_are('public', 'invoices_with_status', 'anon', '{}'::text[], 'anon has no privilege on invoices_with_status');
select table_privs_are('public', 'payment_methods', 'anon', '{}'::text[], 'anon has no privilege on payment_methods');
select table_privs_are('public', 'invoice_number_counters', 'anon', '{}'::text[], 'anon has no privilege on invoice_number_counters');

-- Every privilege of ALL, so losing any one of them fails.
select table_privs_are('public', 'invoices', 'authenticated',
	array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
	'authenticated keeps every privilege on invoices');
select table_privs_are('public', 'invoice_appointments', 'authenticated',
	array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
	'authenticated keeps every privilege on invoice_appointments');
select table_privs_are('public', 'invoices_with_status', 'authenticated',
	array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
	'authenticated keeps every privilege on invoices_with_status');
select table_privs_are('public', 'invoice_number_counters', 'authenticated', '{}'::text[],
	'authenticated has no privilege on invoice_number_counters');


-- payment_methods and invoice_number_counters, as the calling role -------------------------------

select results_eq(
	'select name from public.payment_methods order by sort_order',
	array['e-Transfer', 'Cash', 'Cheque', 'Credit card'],
	'payment_methods is seeded with the four methods in order'
);
select is_empty('select 1 from public.payment_methods where is_hidden', 'no seeded method is hidden');

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is_empty('select id from public.payment_methods', 'an employee can''t read payment_methods');
select throws_ok($$ insert into public.payment_methods (name, sort_order) values ('Bitcoin', 9) $$,
	'42501', null, 'an employee can''t add a payment method');
select is_empty('select id from public.invoices', 'an employee can''t read invoices');
select is_empty('select id, total_cents from public.invoices_with_status',
	'an employee sees no rows (and no totals) on invoices_with_status');
select throws_ok('select year from public.invoice_number_counters', '42501', null,
	'an employee is refused on invoice_number_counters');
select throws_ok($$ insert into public.invoice_number_counters (year) values (2026) $$,
	'42501', null, 'an employee can''t write invoice_number_counters');

set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is((select count(*)::int from public.payment_methods), 4, 'an admin reads every payment method');
select lives_ok($$ insert into public.payment_methods (name, sort_order) values ('Wire', 5) $$,
	'an admin can add a payment method');
select lives_ok($$ update public.payment_methods set is_hidden = true where name = 'Wire' $$,
	'an admin can hide a payment method');
select is((select total_cents from public.invoices_with_status where id = '30000000-0000-4000-8000-000000000001'),
	3500, 'an admin reads the derived total through the view');
select throws_ok('select year from public.invoice_number_counters', '42501', null,
	'not even an admin reads the counters directly');
select throws_ok($$ insert into public.invoice_number_counters (year) values (2026) $$,
	'42501', null, 'not even an admin writes the counters directly');

reset role;
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

select throws_ok('select 1 from public.invoices_with_status', '42501', null,
	'anon is refused on invoices_with_status');

reset role;

select * from finish();

rollback;
