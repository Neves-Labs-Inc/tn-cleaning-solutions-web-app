-- invoice_create_draft and invoice_update_draft (20261009140000), called as an authenticated admin.
--
-- Pins each refusal code, the lines a draft ends up with, the Excluded flag on removal from an
-- Automatic draft, that an update only applies the visits it names (a line that joined after the
-- page loaded stays), and deletion of a draft left with no lines. Rows are read back as postgres.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(43);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a5000000-0000-4000-8000-000000000001', 'pgtap.drafts.admin@example.test'),
	('a5000000-0000-4000-8000-000000000002', 'pgtap.drafts.employee@example.test');

insert into public.clients (id, name) values
	('c5000000-0000-4000-8000-000000000001', 'pgTAP Drafts Client One'),
	('c5000000-0000-4000-8000-000000000002', 'pgTAP Drafts Client Two');

insert into public.jobs (id, name, hourly_rate_cents) values
	('b5000000-0000-4000-8000-000000000001', 'pgTAP Drafts Job', 4500);

-- d1-d3: client one, scheduled (Upcoming). d4: client one, completed. d5: client one, cancelled.
-- d6: client one, archived. d7: client two. d8: client one, completed, on a manual draft below.
-- d9: client one, completed, on the Automatic draft below.
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, is_archived)
values
	('d5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00', 'scheduled', false),
	('d5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '2026-10-02', '09:00', '11:00', 'scheduled', false),
	('d5000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '2026-10-03', '09:00', '11:00', 'scheduled', false),
	('d5000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '2026-10-04', '09:00', '11:00', 'completed', false),
	('d5000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '2026-10-05', '09:00', '11:00', 'cancelled', false),
	('d5000000-0000-4000-8000-000000000006', 'c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '2026-10-06', '09:00', '11:00', 'scheduled', true),
	('d5000000-0000-4000-8000-000000000007', 'c5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', '2026-10-07', '09:00', '11:00', 'scheduled', false),
	('d5000000-0000-4000-8000-000000000008', 'c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '2026-10-08', '09:00', '11:00', 'completed', false),
	('d5000000-0000-4000-8000-000000000009', 'c5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '2026-10-09', '09:00', '11:00', 'completed', false);

-- i1: a manual draft holding d8. i2: client one's Automatic draft holding d9.
-- i3-i5: issued, paid and void invoices. i6: an archived draft.
insert into public.invoices (id, client_id, status, is_automatic, invoice_number, issued_date, paid_date, payment_method, is_archived) values
	('15000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'draft', false, null, null, null, null, false),
	('15000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001', 'draft', true, null, null, null, null, false),
	('15000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000001', 'issued', false, 'INV-901-PGT2026', '2026-10-01', null, null, false),
	('15000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000001', 'paid', false, 'INV-902-PGT2026', '2026-10-01', '2026-10-02', 'Cash', false),
	('15000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000001', 'void', false, 'INV-903-PGT2026', '2026-10-01', null, null, false),
	('15000000-0000-4000-8000-000000000006', 'c5000000-0000-4000-8000-000000000001', 'draft', false, null, null, null, null, true);

insert into public.invoice_appointments (invoice_id, appointment_id) values
	('15000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000008'),
	('15000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000009');


-- Helpers --------------------------------------------------------------------------------------

-- Runs a statement and returns the DETAIL (the invoice error code) it raised, or null.
create function public.pgtap_drafts_code(statement text) returns text
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

-- An invoice's lines as a sorted list of appointment ids' last digit(s), e.g. '{1,2}'.
create function public.pgtap_drafts_lines(invoice uuid) returns text
	language sql security definer
	as $$
	select coalesce(array_agg(right(appointment_id::text, 1) order by appointment_id), '{}')::text
	from public.invoice_appointments
	where invoice_id = invoice;
$$;


-- invoice_create_draft -------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a5000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000001']::uuid[], null, null)
$$), 'not_admin', 'an employee can''t create a draft');

set local request.jwt.claims = '{"sub": "a5000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001', array[]::uuid[], null, null)
$$), 'empty_lines', 'a draft with no visits is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001', null, null, null)
$$), 'empty_lines', 'a draft with a null visit list is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000007']::uuid[], null, null)
$$), 'visit_other_client', 'a visit of another client is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000006']::uuid[], null, null)
$$), 'visit_other_client', 'an archived visit is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-0000000000ff']::uuid[], null, null)
$$), 'visit_other_client', 'an unknown visit is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-0000000000ff',
		array['d5000000-0000-4000-8000-000000000001']::uuid[], null, null)
$$), 'visit_other_client', 'a draft for an unknown client is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000005']::uuid[], null, null)
$$), 'visit_cancelled', 'a cancelled visit is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000008']::uuid[], null, null)
$$), 'visit_claimed', 'a visit on a manual draft is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_create_draft('c5000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000009']::uuid[], null, null)
$$), 'visit_claimed', 'a visit on the Automatic draft is refused');

select ok(public.invoice_create_draft('c5000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000004',
			'd5000000-0000-4000-8000-000000000004']::uuid[], '2026-11-01', 'Thanks!') is not null,
	'an admin creates a draft from an Upcoming and a completed visit');

reset role;

select is(
	(select row(status, is_automatic, due_date, notes, invoice_number, issued_date)::text
	 from public.invoices
	 where client_id = 'c5000000-0000-4000-8000-000000000001' and notes = 'Thanks!'),
	row('draft', false, '2026-11-01'::date, 'Thanks!', null::text, null::date)::text,
	'the new draft is a manual draft with its due date and notes');

select is(
	(select public.pgtap_drafts_lines(id) from public.invoices where notes = 'Thanks!'),
	'{1,4}', 'the new draft has one line per visit, duplicates collapsed');

select is_empty($$
	select 1
	from public.invoice_appointments ia
	join public.invoices i on i.id = ia.invoice_id
	where i.notes = 'Thanks!'
		and (ia.billed_amount_cents is not null or ia.billed_rate_cents is not null or ia.billed_minutes is not null)
$$, 'draft lines store no price');


-- invoice_update_draft: refusals ---------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a5000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000002']::uuid[], array[]::uuid[], null, null)
$$), 'not_admin', 'an employee can''t edit a draft');

set local request.jwt.claims = '{"sub": "a5000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-0000000000ff',
		array['d5000000-0000-4000-8000-000000000002']::uuid[], array[]::uuid[], null, null)
$$), 'invoice_not_found', 'an unknown invoice is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000006',
		array['d5000000-0000-4000-8000-000000000002']::uuid[], array[]::uuid[], null, null)
$$), 'archived_invoice', 'an archived draft is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000003',
		array['d5000000-0000-4000-8000-000000000002']::uuid[], array[]::uuid[], null, null)
$$), 'invalid_status', 'an issued invoice is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000004',
		array['d5000000-0000-4000-8000-000000000002']::uuid[], array[]::uuid[], null, null)
$$), 'invalid_status', 'a paid invoice is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000005',
		array['d5000000-0000-4000-8000-000000000002']::uuid[], array[]::uuid[], null, null)
$$), 'invalid_status', 'a void invoice is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000007']::uuid[], array[]::uuid[], null, null)
$$), 'visit_other_client', 'adding a visit of another client is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000005']::uuid[], array[]::uuid[], null, null)
$$), 'visit_cancelled', 'adding a cancelled visit is refused');

select is(public.pgtap_drafts_code($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000009']::uuid[], array[]::uuid[], null, null)
$$), 'visit_claimed', 'adding a visit claimed by another draft is refused');


-- invoice_update_draft: lines, due date and notes ----------------------------------------------

select lives_ok($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000001',
		array['d5000000-0000-4000-8000-000000000002', 'd5000000-0000-4000-8000-000000000008']::uuid[], null,
		'2026-12-01', 'Edited')
$$, 'an admin adds a line to a manual draft; re-adding a line it holds is a no-op');

reset role;

select is(public.pgtap_drafts_lines('15000000-0000-4000-8000-000000000001'), '{2,8}',
	'the manual draft holds its line and the added one');
select is((select row(due_date, notes)::text from public.invoices where id = '15000000-0000-4000-8000-000000000001'),
	row('2026-12-01'::date, 'Edited')::text, 'the due date and notes are updated');

set local role authenticated;

select lives_ok($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000001',
		array[]::uuid[], array['d5000000-0000-4000-8000-000000000008']::uuid[], null, null)
$$, 'an admin removes a line from a manual draft');

reset role;

select is(public.pgtap_drafts_lines('15000000-0000-4000-8000-000000000001'), '{2}',
	'the removed line is gone from the manual draft');
select is((select excluded_from_automatic from public.appointments where id = 'd5000000-0000-4000-8000-000000000008'),
	false, 'a visit removed from a manual draft is not Excluded');
select is((select row(due_date, notes)::text from public.invoices where id = '15000000-0000-4000-8000-000000000001'),
	row(null::date, null::text)::text, 'a null due date and notes clear them');

-- The admin loaded the Automatic draft holding d9; then d3 completed and joined it.
update public.appointments set status = 'completed' where id = 'd5000000-0000-4000-8000-000000000003';

select is(public.pgtap_drafts_lines('15000000-0000-4000-8000-000000000002'), '{3,9}',
	'a visit completed after the page loaded joins the Automatic draft');

set local role authenticated;

select lives_ok($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000002',
		array[]::uuid[], array['d5000000-0000-4000-8000-000000000009', 'd5000000-0000-4000-8000-000000000002']::uuid[],
		null, null)
$$, 'an admin removes the line they saw from the Automatic draft');

reset role;

select is(public.pgtap_drafts_lines('15000000-0000-4000-8000-000000000002'), '{3}',
	'the line that joined after the page loaded stays');
select is((select excluded_from_automatic from public.appointments where id = 'd5000000-0000-4000-8000-000000000009'),
	true, 'a visit removed from an Automatic draft is Excluded');
select is((select excluded_from_automatic from public.appointments where id = 'd5000000-0000-4000-8000-000000000003'),
	false, 'the visit that joined after the page loaded is not Excluded');
select is(public.pgtap_drafts_lines('15000000-0000-4000-8000-000000000001'), '{2}',
	'removing a visit that is on another draft leaves that draft alone');
select is((select excluded_from_automatic from public.appointments where id = 'd5000000-0000-4000-8000-000000000002'),
	false, 'a removed id that wasn''t on the draft is not Excluded');

set local role authenticated;

select lives_ok($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000002',
		null, array['d5000000-0000-4000-8000-000000000003']::uuid[], null, null)
$$, 'removing the last line of the Automatic draft succeeds');

select lives_ok($$
	select public.invoice_update_draft('15000000-0000-4000-8000-000000000001',
		array[]::uuid[], array['d5000000-0000-4000-8000-000000000002']::uuid[], null, null)
$$, 'removing the last line of the manual draft succeeds');

reset role;

select is_empty($$
	select 1 from public.invoices
	where id in ('15000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002')
$$, 'a draft left with no lines is deleted');
select is((select excluded_from_automatic from public.appointments where id = 'd5000000-0000-4000-8000-000000000003'),
	true, 'the last line removed from an Automatic draft is Excluded too');


-- Every code these functions and the invoicing trigger raise is a known invoice_error code ------

create temporary view pgtap_drafts_raised_codes as
select distinct match[1] as code
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
cross join lateral regexp_matches(pg_get_functiondef(pg_proc.oid), 'invoice_error\(''([a-z_]+)''\)', 'g') as match
where (pg_namespace.nspname, pg_proc.proname) in (
	('public', 'invoice_create_draft'),
	('public', 'invoice_update_draft'),
	('private', 'invoice_lock_visits'),
	('private', 'invoice_add_lines'),
	('private', 'invoice_delete_if_empty'),
	('private', 'invoice_join_automatic_draft'),
	('private', 'stamp_appointment_completed_at'),
	('private', 'sync_invoicing_on_appointment_update')
);

select set_eq('select code from pgtap_drafts_raised_codes', array[
	'not_admin', 'empty_lines', 'invoice_not_found', 'archived_invoice', 'invalid_status',
	'visit_other_client', 'visit_cancelled', 'visit_claimed', 'invoice_paid', 'invoice_issued'
], 'the draft functions and the trigger raise exactly the codes this ticket lists');

select is_empty($$
	select code
	from pgtap_drafts_raised_codes
	where public.pgtap_drafts_code(format('select public.invoice_error(%L)', code)) is distinct from code
$$, 'every code they raise is in the invoice_error list');


select * from finish();

rollback;
