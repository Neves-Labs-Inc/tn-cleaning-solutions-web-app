-- Issue, void, payment and archive (20261009150000), called as the admin through each function.
--
-- Asserts the rows each transition leaves, the Invoice number count, payment_methods and the
-- refusal code (DETAIL) of every refusal, never how a function is written. Business dates are
-- (now() at time zone 'America/New_York')::date, as in invoices_with_status_business_date.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(118);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee@example.test');

-- Automatic invoicing off: this file builds its Automatic drafts by hand, so completing a visit
-- must not let the appointments_invoicing trigger (20261009140000) open one of its own.
insert into public.clients (id, name, automatic_invoicing) values
	('c0000000-0000-4000-8000-000000000001', 'Smith', false),
	('c0000000-0000-4000-8000-000000000002', 'Al', false),
	('c0000000-0000-4000-8000-000000000003', 'Élan 3 Co', false),
	('c0000000-0000-4000-8000-000000000004', 'A.B', false),
	('c0000000-0000-4000-8000-000000000005', 'Auto Client', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b0000000-0000-4000-8000-000000000001', 'pgTAP Job', 4500);

-- d01..d40, all Smith's except d03 (Al), d04 (Élan), d05 (A.B) and d31..d40 (Auto Client).
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
select ('d0000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
	case
		when n = 3 then 'c0000000-0000-4000-8000-000000000002'
		when n = 4 then 'c0000000-0000-4000-8000-000000000003'
		when n = 5 then 'c0000000-0000-4000-8000-000000000004'
		when n > 30 then 'c0000000-0000-4000-8000-000000000005'
		else 'c0000000-0000-4000-8000-000000000001'
	end::uuid,
	'b0000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00'
from generate_series(1, 40) n;

-- Auto Client's visits are completed (Manual completion), as an Automatic draft's always are.
update public.appointments set manually_completed = true, status = 'completed'
where client_id = 'c0000000-0000-4000-8000-000000000005';

-- The count starts fresh for this run, whatever earlier data left behind.
delete from public.invoice_number_counters;

-- Drafts for the issue section: 10..01 Smith (d01, d02), 10..02 Al (d03), 10..03 Élan (d04),
-- 10..04 A.B (d05), 10..05 Smith (d06, d07), 10..06 Smith empty, 10..07 Smith (d08).
insert into public.invoices (id, client_id) values
	('10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
	('10000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000002'),
	('10000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003'),
	('10000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000004'),
	('10000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001'),
	('10000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000001'),
	('10000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001');

insert into public.invoice_appointments (invoice_id, appointment_id) values
	('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001'),
	('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),
	('10000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003'),
	('10000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004'),
	('10000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005'),
	('10000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000006'),
	('10000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000007'),
	('10000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000008');


-- Helpers --------------------------------------------------------------------------------------

-- Runs a statement as the current role and returns the code (DETAIL) it raised, or null.
create function public.pgtap_refusal(statement text) returns text
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

-- p_lines for an invoice: one line per appointment, 4500/h for 60 minutes each.
create function public.pgtap_lines(variadic appointment_ids uuid[]) returns jsonb
	language sql
	as $$
	select coalesce(jsonb_agg(jsonb_build_object(
		'appointment_id', id, 'billed_amount_cents', 4500, 'billed_rate_cents', 4500, 'billed_minutes', 60))
		, '[]'::jsonb)
	from unnest(appointment_ids) id;
$$;

create function public.pgtap_today() returns date
	language sql
	as $$ select (now() at time zone 'America/New_York')::date; $$;

create function public.pgtap_year() returns text
	language sql
	as $$ select extract(year from public.pgtap_today())::text; $$;


-- Issue ----------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is(public.invoice_issue('10000000-0000-4000-8000-000000000001',
	'[{"appointment_id": "d0000000-0000-4000-8000-000000000001", "billed_amount_cents": 9000, "billed_rate_cents": 4500, "billed_minutes": 120},
	  {"appointment_id": "d0000000-0000-4000-8000-000000000002", "billed_amount_cents": 2250, "billed_rate_cents": null, "billed_minutes": null}]',
	null),
	'INV-001-SMI' || public.pgtap_year(), 'the first issue of the year is INV-001 with the client prefix (Smith -> SMI)');

select results_eq($$
	select status, invoice_number, issued_date, due_date from public.invoices where id = '10000000-0000-4000-8000-000000000001'
$$, $$
	values ('issued'::text, 'INV-001-SMI' || public.pgtap_year(), public.pgtap_today(), null::date)
$$, 'issuing sets the status, number and issued_date (Eastern) and a null due date is fine');

select results_eq($$
	select billed_amount_cents, billed_rate_cents, billed_minutes from public.invoice_appointments
	where invoice_id = '10000000-0000-4000-8000-000000000001' order by appointment_id
$$, $$
	values (9000, 4500, 120), (2250, null::integer, null::integer)
$$, 'issuing writes the Billed amount, rate and minutes onto each line');

select is((select total_cents from public.invoices_with_status where id = '10000000-0000-4000-8000-000000000001'),
	11250, 'the derived total equals the sum of the Billed amounts');

select is(public.invoice_issue('10000000-0000-4000-8000-000000000002',
	public.pgtap_lines('d0000000-0000-4000-8000-000000000003'), public.pgtap_today() + 30),
	'INV-002-ALX' || public.pgtap_year(), 'the count is shared across clients, and a short name pads with X (Al -> ALX)');
select is((select due_date from public.invoices where id = '10000000-0000-4000-8000-000000000002'),
	public.pgtap_today() + 30, 'issuing stores the due date');

select is(public.invoice_issue('10000000-0000-4000-8000-000000000003',
	public.pgtap_lines('d0000000-0000-4000-8000-000000000004'), null),
	'INV-003-ELA' || public.pgtap_year(), 'the prefix drops accents and non-letters (Élan 3 Co -> ELA)');
select is(public.invoice_issue('10000000-0000-4000-8000-000000000004',
	public.pgtap_lines('d0000000-0000-4000-8000-000000000005'), null),
	'INV-004-ABX' || public.pgtap_year(), 'the prefix keeps letters only (A.B -> ABX)');

select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		public.pgtap_lines('d0000000-0000-4000-8000-000000000006'), null)
$$), 'draft_changed', 'issuing refuses a line set that misses one of the draft''s visits');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		public.pgtap_lines('d0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000007',
			'd0000000-0000-4000-8000-000000000009'), null)
$$), 'draft_changed', 'issuing refuses a line set that adds a visit the draft doesn''t have');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		public.pgtap_lines('d0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000006'), null)
$$), 'draft_changed', 'issuing refuses a line set that repeats a visit');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		'[{"appointment_id": "d0000000-0000-4000-8000-000000000006", "billed_amount_cents": 4500, "billed_rate_cents": 4500, "billed_minutes": 60},
		  {"appointment_id": "d0000000-0000-4000-8000-000000000007", "billed_amount_cents": null, "billed_rate_cents": null, "billed_minutes": null}]',
		null)
$$), 'unpriced_line', 'issuing refuses a line with a null Billed amount');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		'[{"appointment_id": "d0000000-0000-4000-8000-000000000006", "billed_amount_cents": 4500, "billed_rate_cents": 4500, "billed_minutes": 60},
		  {"appointment_id": "d0000000-0000-4000-8000-000000000007", "billed_amount_cents": -1, "billed_rate_cents": null, "billed_minutes": null}]',
		null)
$$), 'unpriced_line', 'issuing refuses a negative Billed amount');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		public.pgtap_lines('d0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000007'),
		public.pgtap_today() - 1)
$$), 'due_before_issue', 'issuing refuses a due date before today (Eastern)');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000006', '[]', null)
$$), 'empty_lines', 'issuing refuses a draft with no lines');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000001',
		public.pgtap_lines('d0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'), null)
$$), 'invalid_status', 'an issued invoice can''t be issued again');
select is(public.pgtap_refusal($$
	select public.invoice_issue('19999999-0000-4000-8000-000000000000', '[]', null)
$$), 'invoice_not_found', 'issuing an unknown invoice is invoice_not_found');

select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		'[{"appointment_id": "d0000000-0000-4000-8000-000000000006", "billed_amount_cents": 4500, "billed_rate_cents": 4500, "billed_minutes": 60},
		  {"appointment_id": "not-a-uuid", "billed_amount_cents": 4500, "billed_rate_cents": 4500, "billed_minutes": 60}]',
		null)
$$), 'draft_changed', 'an appointment_id that is not a uuid is draft_changed, not a cast error');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		'[{"appointment_id": "d0000000-0000-4000-8000-000000000006", "billed_amount_cents": 4500, "billed_rate_cents": 4500, "billed_minutes": 60},
		  {"appointment_id": "d0000000-0000-4000-8000-000000000007", "billed_amount_cents": 12.5, "billed_rate_cents": null, "billed_minutes": null}]',
		null)
$$), 'unpriced_line', 'a fractional Billed amount is unpriced_line');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		'[{"appointment_id": "d0000000-0000-4000-8000-000000000006", "billed_amount_cents": 4500, "billed_rate_cents": 4500, "billed_minutes": 60},
		  {"appointment_id": "d0000000-0000-4000-8000-000000000007", "billed_amount_cents": "abc", "billed_rate_cents": null, "billed_minutes": null}]',
		null)
$$), 'unpriced_line', 'a Billed amount that is not a number is unpriced_line');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005',
		'[{"appointment_id": "d0000000-0000-4000-8000-000000000006", "billed_amount_cents": 4500, "billed_rate_cents": "x", "billed_minutes": 60},
		  {"appointment_id": "d0000000-0000-4000-8000-000000000007", "billed_amount_cents": 4500, "billed_rate_cents": null, "billed_minutes": null}]',
		null)
$$), 'unpriced_line', 'a rate that is not a whole number is unpriced_line');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000005', '{"lines": []}', null)
$$), 'empty_lines', 'p_lines that is not an array is empty_lines');
select is((select status from public.invoices where id = '10000000-0000-4000-8000-000000000005'),
	'draft', 'a refused issue leaves the draft a draft');
select is_empty($$
	select 1 from public.invoice_appointments
	where invoice_id = '10000000-0000-4000-8000-000000000005' and billed_amount_cents is not null
$$, 'a refused issue writes no Billed amount');

reset role;
select is((select last_value from public.invoice_number_counters where year = public.pgtap_year()::int),
	4, 'refused issues take no number');
update public.invoice_number_counters set last_value = 998 where year = public.pgtap_year()::int;
set local role authenticated;

select is(public.invoice_issue('10000000-0000-4000-8000-000000000005',
	public.pgtap_lines('d0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000007'),
	public.pgtap_today()),
	'INV-999-SMI' || public.pgtap_year(), 'a due date of today is fine, and the count pads to 3 digits up to 999');
select is(public.invoice_issue('10000000-0000-4000-8000-000000000007',
	public.pgtap_lines('d0000000-0000-4000-8000-000000000008'), null),
	'INV-1000-SMI' || public.pgtap_year(), 'the count grows past 999');

select is((select count(distinct invoice_number)::int from public.invoices where invoice_number is not null),
	6, 'every issue got its own number');

reset role;
select is((select last_value from public.invoice_number_counters where year = public.pgtap_year()::int),
	1000, 'the counter holds the last count handed out');


-- Void -----------------------------------------------------------------------------------------

-- 10..05 (INV-999, d06 + d07) gets a Cancelled line; 10..07 (INV-1000, d08) is paid.
update public.invoice_appointments set cancelled_at = '2026-10-02 12:00+00'
where invoice_id = '10000000-0000-4000-8000-000000000005' and appointment_id = 'd0000000-0000-4000-8000-000000000007';
update public.invoices set status = 'paid', paid_date = public.pgtap_today(), payment_method = 'Cash', payment_reference = 'R-1'
where id = '10000000-0000-4000-8000-000000000007';
insert into public.invoices (id, client_id) values
	('10000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001');
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('10000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000009');
set local role authenticated;

select lives_ok($$ select public.invoice_void('10000000-0000-4000-8000-000000000005') $$, 'an issued invoice can be voided');
select results_eq($$
	select status, invoice_number, paid_date, payment_method from public.invoices where id = '10000000-0000-4000-8000-000000000005'
$$, $$
	values ('void'::text, 'INV-999-SMI' || public.pgtap_year(), null::date, null::text)
$$, 'a void invoice keeps its number');
select results_eq($$
	select appointment_id, is_archived, cancelled_at from public.invoice_appointments
	where invoice_id = '10000000-0000-4000-8000-000000000005' order by appointment_id
$$, $$
	values ('d0000000-0000-4000-8000-000000000006'::uuid, true, null::timestamptz),
		('d0000000-0000-4000-8000-000000000007'::uuid, true, '2026-10-02 12:00+00'::timestamptz)
$$, 'voiding releases every line and leaves cancelled_at as it was');
select is((select total_cents from public.invoices_with_status where id = '10000000-0000-4000-8000-000000000005'),
	4500, 'a void invoice keeps its original total (Cancelled line still excluded)');
select lives_ok($$
	insert into public.invoices (id, client_id) values ('10000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000001');
	insert into public.invoice_appointments (invoice_id, appointment_id) values
		('10000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000006')
$$, 'a visit released by a void can be claimed again');

select lives_ok($$ select public.invoice_void('10000000-0000-4000-8000-000000000007') $$, 'a paid invoice can be voided');
select results_eq($$
	select status, invoice_number, paid_date, payment_method, payment_reference
	from public.invoices where id = '10000000-0000-4000-8000-000000000007'
$$, $$
	values ('void'::text, 'INV-1000-SMI' || public.pgtap_year(), null::date, null::text, null::text)
$$, 'voiding a paid invoice clears its Payment and keeps its number');
select is((select bool_and(is_archived) from public.invoice_appointments where invoice_id = '10000000-0000-4000-8000-000000000007'),
	true, 'voiding a paid invoice releases its lines');

select is(public.invoice_issue('10000000-0000-4000-8000-000000000008',
	public.pgtap_lines('d0000000-0000-4000-8000-000000000009'), null),
	'INV-1001-SMI' || public.pgtap_year(), 'after a void the next issue takes the next count, never the voided one');

select is(public.pgtap_refusal($$ select public.invoice_void('10000000-0000-4000-8000-000000000006') $$),
	'invalid_status', 'a draft can''t be voided');
select is(public.pgtap_refusal($$ select public.invoice_void('10000000-0000-4000-8000-000000000005') $$),
	'invalid_status', 'a void invoice can''t be voided again');
select is(public.pgtap_refusal($$ select public.invoice_void('19999999-0000-4000-8000-000000000000') $$),
	'invoice_not_found', 'voiding an unknown invoice is invoice_not_found');


-- Payment --------------------------------------------------------------------------------------

-- Issued: 10..02 (Al), 10..03 (Élan), 10..04 (A.B, backdated so it is past due once unpaid).
reset role;
update public.invoices set issued_date = public.pgtap_today() - 40, due_date = public.pgtap_today() - 10
where id = '10000000-0000-4000-8000-000000000004';
set local role authenticated;

select lives_ok($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000003', public.pgtap_today(), ' Wire ', '  CONF-9 ')
$$, 'a Payment dated today (Eastern) is recorded');
select results_eq($$
	select status, paid_date, payment_method, payment_reference from public.invoices where id = '10000000-0000-4000-8000-000000000003'
$$, $$
	values ('paid'::text, public.pgtap_today(), 'Wire'::text, 'CONF-9'::text)
$$, 'recording a Payment sets paid, the date, the method text and the trimmed reference');
select results_eq($$
	select name, is_hidden, sort_order from public.payment_methods where name ilike 'wire'
$$, $$
	values ('Wire'::text, false, 5)
$$, 'a new method joins payment_methods, unhidden and last');

select lives_ok($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000004', public.pgtap_today() - 41, 'cASH', '')
$$, 'a paid date before the issue date is accepted');
select results_eq($$
	select paid_date, payment_method, payment_reference from public.invoices where id = '10000000-0000-4000-8000-000000000004'
$$, $$
	values (public.pgtap_today() - 41, 'Cash'::text, null::text)
$$, 'an existing method in another case is reused by its listed name, and a blank reference is null');
select is((select count(*)::int from public.payment_methods), 5, 'reusing a method adds no row');

select lives_ok($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000008', public.pgtap_today(), E' credit \t  CARD ', E'\tREF\n')
$$, 'a method with odd spacing is recorded');
select results_eq($$
	select payment_method, payment_reference from public.invoices where id = '10000000-0000-4000-8000-000000000008'
$$, $$ values ('Credit card'::text, 'REF'::text) $$, 'inner whitespace collapses, so it reuses Credit card');
select is((select count(*)::int from public.payment_methods), 5, 'collapsing whitespace adds no row');
reset role;
select throws_ok($$ insert into public.payment_methods (name, sort_order) values ('WIRE', 9) $$,
	'23505', null, 'payment method names are unique ignoring case');
set local role authenticated;

select is(public.pgtap_refusal($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000002', public.pgtap_today() + 1, 'Cash', null)
$$), 'paid_date_future', 'a paid date of tomorrow (Eastern) is refused');
select is(public.pgtap_refusal($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000002', public.pgtap_today(), '   ', null)
$$), 'method_required', 'a blank method is refused');
select is(public.pgtap_refusal($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000002', public.pgtap_today(), E'\t\n', null)
$$), 'method_required', 'a method of tabs and newlines is blank');
select is(public.pgtap_refusal($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000002', public.pgtap_today(), null, null)
$$), 'method_required', 'a missing method is refused');
select is(public.pgtap_refusal($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000003', public.pgtap_today(), 'Cash', null)
$$), 'invalid_status', 'a paid invoice can''t take a second Payment');
select is(public.pgtap_refusal($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000006', public.pgtap_today(), 'Cash', null)
$$), 'invalid_status', 'a draft can''t be paid');
select is(public.pgtap_refusal($$
	select public.invoice_record_payment('19999999-0000-4000-8000-000000000000', public.pgtap_today(), 'Cash', null)
$$), 'invoice_not_found', 'paying an unknown invoice is invoice_not_found');
select is((select status from public.invoices where id = '10000000-0000-4000-8000-000000000002'),
	'issued', 'a refused Payment leaves the invoice issued');

select lives_ok($$
	select public.invoice_update_payment('10000000-0000-4000-8000-000000000003', public.pgtap_today() - 1, 'cheque', 'CHQ-1')
$$, 'a Payment can be edited');
select results_eq($$
	select status, paid_date, payment_method, payment_reference from public.invoices where id = '10000000-0000-4000-8000-000000000003'
$$, $$
	values ('paid'::text, public.pgtap_today() - 1, 'Cheque'::text, 'CHQ-1'::text)
$$, 'editing a Payment rewrites the date, method and reference');
select is(public.pgtap_refusal($$
	select public.invoice_update_payment('10000000-0000-4000-8000-000000000003', public.pgtap_today() + 1, 'Cash', null)
$$), 'paid_date_future', 'an edited paid date can''t be in the future');
select is(public.pgtap_refusal($$
	select public.invoice_update_payment('10000000-0000-4000-8000-000000000003', public.pgtap_today(), '', null)
$$), 'method_required', 'an edited Payment needs a method');
select is(public.pgtap_refusal($$
	select public.invoice_update_payment('10000000-0000-4000-8000-000000000002', public.pgtap_today(), 'Cash', null)
$$), 'invalid_status', 'an unpaid invoice has no Payment to edit');
select is(public.pgtap_refusal($$
	select public.invoice_update_payment('19999999-0000-4000-8000-000000000000', public.pgtap_today(), 'Cash', null)
$$), 'invoice_not_found', 'editing the Payment of an unknown invoice is invoice_not_found');

select lives_ok($$ select public.invoice_undo_payment('10000000-0000-4000-8000-000000000003') $$, 'a Payment can be undone');
select results_eq($$
	select status, paid_date, payment_method, payment_reference from public.invoices where id = '10000000-0000-4000-8000-000000000003'
$$, $$
	values ('issued'::text, null::date, null::text, null::text)
$$, 'undoing a Payment puts the invoice back to issued with no Payment');
select lives_ok($$ select public.invoice_undo_payment('10000000-0000-4000-8000-000000000004') $$,
	'a Payment on a past-due invoice can be undone');
select is((select effective_status from public.invoices_with_status where id = '10000000-0000-4000-8000-000000000004'),
	'overdue', 'an undone Payment past its due date is overdue again');
select is(public.pgtap_refusal($$ select public.invoice_undo_payment('10000000-0000-4000-8000-000000000002') $$),
	'invalid_status', 'an unpaid invoice has no Payment to undo');
select is(public.pgtap_refusal($$ select public.invoice_undo_payment('19999999-0000-4000-8000-000000000000') $$),
	'invoice_not_found', 'undoing the Payment of an unknown invoice is invoice_not_found');

select lives_ok($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000002', null, 'Cash', null)
$$, 'a Payment with no date is recorded');
select is((select paid_date from public.invoices where id = '10000000-0000-4000-8000-000000000002'),
	public.pgtap_today(), 'a Payment with no date is dated today (Eastern)');


-- Archive --------------------------------------------------------------------------------------

-- 10..10 is Auto Client's Automatic draft (d31, d32). 10..09 is a manual draft (d06), 10..02 paid,
-- 10..05 void, 10..01 issued.
reset role;
insert into public.invoices (id, client_id, is_automatic) values
	('10000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000005', true);
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('10000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000031'),
	('10000000-0000-4000-8000-000000000010', 'd0000000-0000-4000-8000-000000000032');
set local role authenticated;

select is(public.pgtap_refusal($$ select public.invoice_archive('10000000-0000-4000-8000-000000000001') $$),
	'invalid_status', 'an issued invoice (still owed) can''t be archived');
select is(public.pgtap_refusal($$ select public.invoice_archive('19999999-0000-4000-8000-000000000000') $$),
	'invoice_not_found', 'archiving an unknown invoice is invoice_not_found');

select lives_ok($$ select public.invoice_archive('10000000-0000-4000-8000-000000000009') $$, 'a draft can be archived');
select is((select is_archived from public.invoices where id = '10000000-0000-4000-8000-000000000009'),
	true, 'archiving flags the invoice');
select is((select is_archived from public.invoice_appointments where invoice_id = '10000000-0000-4000-8000-000000000009'),
	true, 'archiving a draft releases its lines');
select is((select excluded_from_automatic from public.appointments where id = 'd0000000-0000-4000-8000-000000000006'),
	false, 'archiving a manual draft doesn''t mark its visits Excluded');

select lives_ok($$ select public.invoice_archive('10000000-0000-4000-8000-000000000010') $$, 'an Automatic draft can be archived');
select results_eq($$
	select ia.is_archived, a.excluded_from_automatic
	from public.invoice_appointments ia join public.appointments a on a.id = ia.appointment_id
	where ia.invoice_id = '10000000-0000-4000-8000-000000000010' order by a.id
$$, $$ values (true, true), (true, true) $$, 'archiving an Automatic draft releases its lines and marks its visits Excluded');

select lives_ok($$ select public.invoice_archive('10000000-0000-4000-8000-000000000002') $$, 'a paid invoice can be archived');
select results_eq($$
	select i.status, i.is_archived, ia.is_archived
	from public.invoices i join public.invoice_appointments ia on ia.invoice_id = i.id
	where i.id = '10000000-0000-4000-8000-000000000002'
$$, $$ values ('paid'::text, true, false) $$, 'archiving a paid invoice only flags it; its lines keep their claim');
select lives_ok($$ select public.invoice_archive('10000000-0000-4000-8000-000000000005') $$, 'a void invoice can be archived');
select results_eq($$
	select status, is_archived from public.invoices where id = '10000000-0000-4000-8000-000000000005'
$$, $$ values ('void'::text, true) $$, 'archiving a void invoice only flags it');


-- Archived invoices are read-only --------------------------------------------------------------

select is(public.pgtap_refusal($$ select public.invoice_void('10000000-0000-4000-8000-000000000002') $$),
	'archived_invoice', 'an archived invoice can''t be voided');
select is(public.pgtap_refusal($$
	select public.invoice_update_payment('10000000-0000-4000-8000-000000000002', public.pgtap_today(), 'Cash', null)
$$), 'archived_invoice', 'an archived invoice''s Payment can''t be edited');
select is(public.pgtap_refusal($$ select public.invoice_undo_payment('10000000-0000-4000-8000-000000000002') $$),
	'archived_invoice', 'an archived invoice''s Payment can''t be undone');
select is(public.pgtap_refusal($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000002', public.pgtap_today(), 'Cash', null)
$$), 'archived_invoice', 'an archived invoice can''t take a Payment');
select is(public.pgtap_refusal($$ select public.invoice_archive('10000000-0000-4000-8000-000000000002') $$),
	'archived_invoice', 'an archived invoice can''t be archived again');
select is(public.pgtap_refusal($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000009',
		public.pgtap_lines('d0000000-0000-4000-8000-000000000006'), null)
$$), 'archived_invoice', 'an archived draft can''t be issued');


-- Unarchive ------------------------------------------------------------------------------------

select is(public.pgtap_refusal($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000001') $$),
	'invalid_status', 'an invoice that isn''t archived can''t be unarchived');
select is(public.pgtap_refusal($$ select public.invoice_unarchive('19999999-0000-4000-8000-000000000000') $$),
	'invoice_not_found', 'unarchiving an unknown invoice is invoice_not_found');

select lives_ok($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000002') $$, 'a paid invoice can be unarchived');
select results_eq($$
	select i.status, i.is_archived, ia.is_archived
	from public.invoices i join public.invoice_appointments ia on ia.invoice_id = i.id
	where i.id = '10000000-0000-4000-8000-000000000002'
$$, $$ values ('paid'::text, false, false) $$, 'unarchiving a paid invoice just clears the flag');
select lives_ok($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000005') $$, 'a void invoice can be unarchived');
select results_eq($$
	select i.status, i.is_archived, bool_and(ia.is_archived)
	from public.invoices i join public.invoice_appointments ia on ia.invoice_id = i.id
	where i.id = '10000000-0000-4000-8000-000000000005' group by i.status, i.is_archived
$$, $$ values ('void'::text, false, true) $$, 'unarchiving a void invoice just clears the flag; its lines stay released');

-- d06 (on the archived draft 10..09) is now claimed by another draft.
reset role;
insert into public.invoices (id, client_id) values
	('10000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001');
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('10000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000006');
set local role authenticated;

select is(public.pgtap_refusal($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000009') $$),
	'visit_claimed', 'a draft whose visit is on another live invoice can''t be unarchived');
select is((select is_archived from public.invoices where id = '10000000-0000-4000-8000-000000000009'),
	true, 'a refused unarchive leaves the draft archived');

reset role;
delete from public.invoice_appointments where invoice_id = '10000000-0000-4000-8000-000000000011';
set local role authenticated;

select lives_ok($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000009') $$,
	'once the visit is free again the draft can be unarchived');
select results_eq($$
	select i.status, i.is_archived, ia.is_archived
	from public.invoices i join public.invoice_appointments ia on ia.invoice_id = i.id
	where i.id = '10000000-0000-4000-8000-000000000009'
$$, $$ values ('draft'::text, false, false) $$, 'unarchiving a draft re-claims its lines');

select lives_ok($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000010') $$,
	'an Automatic draft can be unarchived');
select results_eq($$
	select i.is_automatic, ia.is_archived, a.excluded_from_automatic
	from public.invoices i
	join public.invoice_appointments ia on ia.invoice_id = i.id
	join public.appointments a on a.id = ia.appointment_id
	where i.id = '10000000-0000-4000-8000-000000000010' order by a.id
$$, $$ values (true, false, false), (true, false, false) $$,
	'with no other Automatic draft it comes back Automatic, its lines re-claimed and its visits no longer Excluded');

-- Archive it again, and let the client open a new Automatic draft (d33) meanwhile.
select lives_ok($$ select public.invoice_archive('10000000-0000-4000-8000-000000000010') $$, 'the Automatic draft is archived again');
reset role;
insert into public.invoices (id, client_id, is_automatic) values
	('10000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000005', true);
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('10000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000033');
set local role authenticated;

select lives_ok($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000010') $$,
	'an Automatic draft can be unarchived while the client has another one');
select results_eq($$
	select i.is_automatic, ia.is_archived, a.excluded_from_automatic
	from public.invoices i
	join public.invoice_appointments ia on ia.invoice_id = i.id
	join public.appointments a on a.id = ia.appointment_id
	where i.id = '10000000-0000-4000-8000-000000000010' order by a.id
$$, $$ values (false, false, true), (false, false, true) $$,
	'it comes back as an ordinary draft, lines re-claimed, visits still Excluded');
select is((select is_automatic from public.invoices where id = '10000000-0000-4000-8000-000000000012'),
	true, 'the client''s other Automatic draft stays Automatic');

-- 10..15 is an Automatic draft for Smith (d12, d13 completed); d13 is reopened while it is archived.
reset role;
update public.appointments set manually_completed = true, status = 'completed'
where id in ('d0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000013');
insert into public.invoices (id, client_id, is_automatic) values
	('10000000-0000-4000-8000-000000000015', 'c0000000-0000-4000-8000-000000000001', true);
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('10000000-0000-4000-8000-000000000015', 'd0000000-0000-4000-8000-000000000012'),
	('10000000-0000-4000-8000-000000000015', 'd0000000-0000-4000-8000-000000000013');
set local role authenticated;
select lives_ok($$ select public.invoice_archive('10000000-0000-4000-8000-000000000015') $$, 'an Automatic draft is archived');
reset role;
update public.appointments set manually_completed = false where id = 'd0000000-0000-4000-8000-000000000013';
set local role authenticated;

select is((select status from public.appointments where id = 'd0000000-0000-4000-8000-000000000013'),
	'scheduled', 'undo complete reopens the visit');
select lives_ok($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000015') $$,
	'an Automatic draft holding a reopened visit can be unarchived');
select results_eq($$
	select i.is_automatic, ia.is_archived, a.excluded_from_automatic
	from public.invoices i
	join public.invoice_appointments ia on ia.invoice_id = i.id
	join public.appointments a on a.id = ia.appointment_id
	where i.id = '10000000-0000-4000-8000-000000000015' order by a.id
$$, $$ values (false, false, true), (false, false, true) $$,
	'it comes back as an ordinary draft holding its lines, visits still Excluded');


-- 10..13 (d10) and 10..14 (d11) are Smith drafts archived, then d10 is cancelled and d11 moves
-- to Al while their lines are released.
reset role;
insert into public.invoices (id, client_id) values
	('10000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000001'),
	('10000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-000000000001');
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('10000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000010'),
	('10000000-0000-4000-8000-000000000014', 'd0000000-0000-4000-8000-000000000011');
set local role authenticated;
select lives_ok($$
	select public.invoice_archive('10000000-0000-4000-8000-000000000013');
	select public.invoice_archive('10000000-0000-4000-8000-000000000014')
$$, 'two drafts are archived');
reset role;
update public.appointments set status = 'cancelled' where id = 'd0000000-0000-4000-8000-000000000010';
update public.appointments set client_id = 'c0000000-0000-4000-8000-000000000002' where id = 'd0000000-0000-4000-8000-000000000011';
set local role authenticated;

select is(public.pgtap_refusal($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000013') $$),
	'visit_cancelled', 'a draft whose visit was cancelled while archived can''t be unarchived');
select is(public.pgtap_refusal($$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000014') $$),
	'visit_other_client', 'a draft whose visit moved to another client while archived can''t be unarchived');
select results_eq($$
	select i.is_archived, ia.is_archived
	from public.invoices i join public.invoice_appointments ia on ia.invoice_id = i.id
	where i.id in ('10000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000014')
$$, $$ values (true, true), (true, true) $$, 'the refused drafts stay archived with their lines kept, still released');


-- Employees are refused --------------------------------------------------------------------------

set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is_empty($$
	select statement
	from unnest(array[
		$s$ select public.invoice_issue('10000000-0000-4000-8000-000000000006', '[]', null) $s$,
		$s$ select public.invoice_void('10000000-0000-4000-8000-000000000001') $s$,
		$s$ select public.invoice_record_payment('10000000-0000-4000-8000-000000000001', null, 'Cash', null) $s$,
		$s$ select public.invoice_update_payment('10000000-0000-4000-8000-000000000002', null, 'Cash', null) $s$,
		$s$ select public.invoice_undo_payment('10000000-0000-4000-8000-000000000002') $s$,
		$s$ select public.invoice_archive('10000000-0000-4000-8000-000000000002') $s$,
		$s$ select public.invoice_unarchive('10000000-0000-4000-8000-000000000009') $s$
	]) statement
	where public.pgtap_refusal(statement) is distinct from 'not_admin'
$$, 'an employee gets not_admin from every function');

reset role;
select results_eq($$
	select status, is_archived from public.invoices where id in (
		'10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
	order by id
$$, $$ values ('issued'::text, false), ('paid'::text, false) $$, 'the refused employee calls changed nothing');


-- Every code these functions raise is in the invoice_error list ---------------------------------

select is_empty($$
	select code
	from unnest(array[
		'not_admin', 'invoice_not_found', 'invalid_status', 'archived_invoice', 'draft_changed',
		'unpriced_line', 'empty_lines', 'due_before_issue', 'paid_date_future', 'method_required',
		'visit_claimed', 'visit_cancelled', 'visit_other_client'
	]) code
	where public.pgtap_refusal(format('select public.invoice_error(%L)', code)) is distinct from code
$$, 'every code asserted in this file is one invoice_error knows');


select * from finish();

rollback;
