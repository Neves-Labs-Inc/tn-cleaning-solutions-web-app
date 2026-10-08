-- invoices_with_status derives "overdue" from today's date in America/New_York.
--
-- An issued invoice due today (Eastern) is still 'issued'; one due yesterday (Eastern) is
-- 'overdue'. The rule must not follow the session time zone, which is UTC on Supabase: the same
-- four assertions run under two session zones chosen so that, at any hour of the day, at least
-- one of them has a calendar date different from New York's (Kiritimati runs 18-19 hours ahead,
-- Pago Pago 6-7 hours behind). A view keyed on CURRENT_DATE therefore fails here whatever the
-- wall clock says when the suite runs.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into public.clients (id, name) values
	('c0000000-0000-4000-8000-000000000011', 'pgTAP Invoice Client');

insert into public.invoices (id, client_id, status, issued_date, due_date, total_cents) values
	-- due today in New York
	('10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000011', 'issued',
	 (now() at time zone 'America/New_York')::date - 14, (now() at time zone 'America/New_York')::date, 10000),
	-- due yesterday in New York
	('10000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000011', 'issued',
	 (now() at time zone 'America/New_York')::date - 15, (now() at time zone 'America/New_York')::date - 1, 10000);


-- Helpers --------------------------------------------------------------------------------------

create function public.pgtap_effective_status(invoice uuid) returns text
	language sql
	as $$
	select effective_status from public.invoices_with_status where id = invoice;
$$;


-- Shape is unchanged from the snapshot --------------------------------------------------------

select view_owner_is('public', 'invoices_with_status', 'postgres', 'invoices_with_status is still owned by postgres');
select columns_are('public', 'invoices_with_status', array[
	'id', 'client_id', 'status', 'issued_date', 'due_date', 'total_cents', 'notes', 'created_at',
	'updated_at', 'is_archived', 'effective_status'
], 'invoices_with_status keeps the snapshot column list');
select is(
	(select reloptions::text[] @> array['security_invoker=true'] from pg_class where oid = 'public.invoices_with_status'::regclass),
	true, 'invoices_with_status keeps security_invoker');


-- Session zone far ahead of New York -----------------------------------------------------------

set local time zone 'Pacific/Kiritimati';

select is(public.pgtap_effective_status('10000000-0000-4000-8000-000000000001'),
	'issued', 'Kiritimati session: due today in New York is issued');
select is(public.pgtap_effective_status('10000000-0000-4000-8000-000000000002'),
	'overdue', 'Kiritimati session: due yesterday in New York is overdue');


-- Session zone behind New York -----------------------------------------------------------------

set local time zone 'Pacific/Pago_Pago';

select is(public.pgtap_effective_status('10000000-0000-4000-8000-000000000001'),
	'issued', 'Pago Pago session: due today in New York is issued');
select is(public.pgtap_effective_status('10000000-0000-4000-8000-000000000002'),
	'overdue', 'Pago Pago session: due yesterday in New York is overdue');


-- UTC, the Supabase default ---------------------------------------------------------------------

set local time zone 'UTC';

select is(public.pgtap_effective_status('10000000-0000-4000-8000-000000000001'),
	'issued', 'UTC session: due today in New York is issued');
select is(public.pgtap_effective_status('10000000-0000-4000-8000-000000000002'),
	'overdue', 'UTC session: due yesterday in New York is overdue');


-- Other statuses are passed through unchanged ---------------------------------------------------

update public.invoices set status = 'paid' where id = '10000000-0000-4000-8000-000000000002';
select is(public.pgtap_effective_status('10000000-0000-4000-8000-000000000002'),
	'paid', 'a paid invoice past its due date is paid, not overdue');

update public.invoices set status = 'draft', due_date = null where id = '10000000-0000-4000-8000-000000000002';
select is(public.pgtap_effective_status('10000000-0000-4000-8000-000000000002'),
	'draft', 'a draft with no due date is draft');

select * from finish();

rollback;
