-- invoices_with_status.activity_date: the date the ledger orders by, newest first.
--
-- activity_date is the issue date when set, else the Business date (Eastern) the invoice was
-- created on. The ledger orders by activity_date desc nulls last, then created_at desc, in the database, so
-- the newest 1000 rows PostgREST returns really are the newest.
--
-- Session zone is UTC (the Supabase default) so a late-evening Eastern draft falls on the next UTC
-- day: a view keyed on the session zone fails here.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

set local time zone 'UTC';


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

-- Automatic invoicing off, so no trigger opens drafts of its own.
insert into public.clients (id, name, automatic_invoicing) values
	('c0000000-0000-4000-8000-000000000031', 'pgTAP Activity Client', false);

insert into public.invoices (id, client_id, status, invoice_number, issued_date, due_date, created_at) values
	-- Draft created 23:30 Eastern on Oct 9 (03:30 UTC on Oct 10).
	('10000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000031', 'draft', null,
	 null, null, '2026-10-09 23:30:00 America/New_York'),
	-- Created in September, issued Oct 10.
	('10000000-0000-4000-8000-000000000032', 'c0000000-0000-4000-8000-000000000031', 'issued', 'PGT-ACT-32',
	 '2026-10-10', '2026-10-24', '2026-09-01 10:00:00 America/New_York'),
	-- Draft created 08:00 Eastern on Oct 9, earlier the same Business day as 31.
	('10000000-0000-4000-8000-000000000033', 'c0000000-0000-4000-8000-000000000031', 'draft', null,
	 null, null, '2026-10-09 08:00:00 America/New_York'),
	-- Created Oct 1, issued Oct 9: same activity date as 31 and 33, created earliest.
	('10000000-0000-4000-8000-000000000034', 'c0000000-0000-4000-8000-000000000031', 'issued', 'PGT-ACT-34',
	 '2026-10-09', '2026-10-23', '2026-10-01 10:00:00 America/New_York');


-- Helpers --------------------------------------------------------------------------------------

create function public.pgtap_activity_date(invoice uuid) returns date
	language sql
	as $$
	select activity_date from public.invoices_with_status where id = invoice;
$$;


-- activity_date --------------------------------------------------------------------------------

select is(public.pgtap_activity_date('10000000-0000-4000-8000-000000000031'), '2026-10-09'::date,
	'a draft created 23:30 Eastern on Oct 9 has activity date Oct 9');
select is(public.pgtap_activity_date('10000000-0000-4000-8000-000000000033'), '2026-10-09'::date,
	'a draft created in the Eastern morning has that day as its activity date');
select is(public.pgtap_activity_date('10000000-0000-4000-8000-000000000032'), '2026-10-10'::date,
	'an issued invoice has its issue date as its activity date, not its created date');


-- Ledger order: activity_date desc nulls last, created_at desc nulls last, id desc ------------------------

select results_eq(
	$$
	select id from public.invoices_with_status
	where client_id = 'c0000000-0000-4000-8000-000000000031'
	order by activity_date desc nulls last, created_at desc nulls last, id desc
	$$,
	$$
	values
		('10000000-0000-4000-8000-000000000032'::uuid),
		('10000000-0000-4000-8000-000000000031'::uuid),
		('10000000-0000-4000-8000-000000000033'::uuid),
		('10000000-0000-4000-8000-000000000034'::uuid)
	$$,
	'the ledger order puts the newest activity first, then the newest created'
);


-- The view keeps its security and grants -------------------------------------------------------

select is(
	(select reloptions::text[] @> array['security_invoker=true'] from pg_class where oid = 'public.invoices_with_status'::regclass),
	true, 'invoices_with_status keeps security_invoker');
select ok(
	not has_table_privilege('anon', 'public.invoices_with_status', 'select')
		and has_table_privilege('authenticated', 'public.invoices_with_status', 'select'),
	'anon still cannot read invoices_with_status; authenticated can');

select * from finish();

rollback;
