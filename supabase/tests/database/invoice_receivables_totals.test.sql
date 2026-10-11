-- invoice_receivables_totals (20261010173500): the Receivables figures, summed in the database so
-- they stay right past PostgREST's 1000-row cap.
--
-- Seeds more than 1000 issued invoices for one client, plus paid, void, archived and draft ones
-- that must not count as owed, and a second client to check the client id scopes every figure.
-- Business dates are (now() at time zone 'America/New_York')::date, as in
-- invoices_with_status_business_date.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

-- What the database held before this file's fixtures.
create temporary table pgtap_baseline as select * from public.invoice_receivables_totals();
grant select on pgtap_baseline to authenticated;

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000021', 'pgtap.totals.admin@example.test'),
	('a0000000-0000-4000-8000-000000000022', 'pgtap.totals.employee@example.test');

-- Automatic invoicing off, so no trigger opens drafts of its own.
insert into public.clients (id, name, automatic_invoicing) values
	('c0000000-0000-4000-8000-000000000021', 'pgTAP Totals Big', false),
	('c0000000-0000-4000-8000-000000000022', 'pgTAP Totals Small', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b0000000-0000-4000-8000-000000000021', 'pgTAP Totals Job', 4500);

create function public.pgtap_today() returns date
	language sql
	as $$ select (now() at time zone 'America/New_York')::date; $$;

-- Big: 1100 issued invoices of $10.00 each. n % 4 = 0 overdue (275), n % 4 = 1 no due date (275),
-- the rest due in 30 days (550). Then extras that must not count, numbered 2001+:
--   2001-2003 paid, 2004-2005 void, 2006 issued but archived, 2007 paid and archived.
-- Small: 10 issued invoices of $20.00, even n overdue (5), the rest due in 30 days.
create temporary table pgtap_seed (n int, client_id uuid, status text, due_date date, is_archived boolean, amount int);

insert into pgtap_seed
select n, 'c0000000-0000-4000-8000-000000000021', 'issued',
	case n % 4 when 0 then public.pgtap_today() - 1 when 1 then null else public.pgtap_today() + 30 end,
	false, 1000
from generate_series(1, 1100) n;

insert into pgtap_seed values
	(2001, 'c0000000-0000-4000-8000-000000000021', 'paid', public.pgtap_today() - 1, false, 1000),
	(2002, 'c0000000-0000-4000-8000-000000000021', 'paid', null, false, 1000),
	(2003, 'c0000000-0000-4000-8000-000000000021', 'paid', public.pgtap_today() + 30, false, 1000),
	(2004, 'c0000000-0000-4000-8000-000000000021', 'void', public.pgtap_today() - 1, false, 1000),
	(2005, 'c0000000-0000-4000-8000-000000000021', 'void', null, false, 1000),
	(2006, 'c0000000-0000-4000-8000-000000000021', 'issued', public.pgtap_today() - 1, true, 1000),
	(2007, 'c0000000-0000-4000-8000-000000000021', 'paid', null, true, 1000);

insert into pgtap_seed
select 3000 + n, 'c0000000-0000-4000-8000-000000000022', 'issued',
	case when n % 2 = 0 then public.pgtap_today() - 1 else public.pgtap_today() + 30 end,
	false, 2000
from generate_series(1, 10) n;

insert into public.invoices (id, client_id, status, invoice_number, issued_date, due_date, is_archived, paid_date, payment_method)
select md5('pgtap-totals-invoice-' || n)::uuid, client_id, status, 'PGT-TOTALS-' || n,
	public.pgtap_today() - 60, due_date, is_archived,
	case when status = 'paid' then public.pgtap_today() - 30 end,
	case when status = 'paid' then 'Cash' end
from pgtap_seed;

-- One visit and one billed line per invoice.
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
select md5('pgtap-totals-visit-' || n)::uuid, client_id, 'b0000000-0000-4000-8000-000000000021',
	public.pgtap_today() - 61, '09:00', '11:00'
from pgtap_seed;

-- A void invoice's lines are released; its view total still counts them.
insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents, is_archived)
select md5('pgtap-totals-invoice-' || n)::uuid, md5('pgtap-totals-visit-' || n)::uuid, amount, status = 'void'
from pgtap_seed;

-- Drafts: Big has 2 open and 1 archived, Small has 1 open. Drafts store no price, so they add
-- nothing to the dollar figures.
insert into public.invoices (client_id, is_archived) values
	('c0000000-0000-4000-8000-000000000021', false),
	('c0000000-0000-4000-8000-000000000021', false),
	('c0000000-0000-4000-8000-000000000021', true),
	('c0000000-0000-4000-8000-000000000022', false);


-- Shape ----------------------------------------------------------------------------------------

select isnt_definer('public', 'invoice_receivables_totals', array['uuid'],
	'invoice_receivables_totals runs with the caller''s rights');
select volatility_is('public', 'invoice_receivables_totals', array['uuid'], 'stable',
	'invoice_receivables_totals is stable');
select function_privs_are('public', 'invoice_receivables_totals', array['uuid'], 'authenticated', array['EXECUTE'],
	'authenticated can execute invoice_receivables_totals');
select function_privs_are('public', 'invoice_receivables_totals', array['uuid'], 'anon', array[]::text[],
	'anon cannot execute invoice_receivables_totals');


-- As the admin ---------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000021", "role": "authenticated", "app_metadata": {"role": "admin"}}';

-- Only this file's clients are compared, so rows other suites or seed data left behind don't matter.
select results_eq(
	$$select outstanding_cents, overdue_cents, no_due_date_cents, unpaid_count, draft_count
	  from public.invoice_receivables_totals('c0000000-0000-4000-8000-000000000021')$$,
	$$values (1100000::bigint, 275000::bigint, 275000::bigint, 1100, 2)$$,
	'more than 1000 issued invoices: every one counts; paid, void, archived and drafts are not owed');

select results_eq(
	$$select outstanding_cents, overdue_cents, no_due_date_cents, unpaid_count, draft_count
	  from public.invoice_receivables_totals('c0000000-0000-4000-8000-000000000022')$$,
	$$values (20000::bigint, 10000::bigint, 0::bigint, 10, 1)$$,
	'a client id scopes every figure to that client');

-- No client id: every client. Compared against the baseline taken before the fixtures, so data
-- from outside this file cancels out (the admin's RLS sees every invoice, as postgres does).
select results_eq(
	$$select t.outstanding_cents - b.outstanding_cents, t.overdue_cents - b.overdue_cents,
	         t.no_due_date_cents - b.no_due_date_cents, t.unpaid_count - b.unpaid_count,
	         t.draft_count - b.draft_count
	  from public.invoice_receivables_totals() t, pgtap_baseline b$$,
	$$values (1120000::bigint, 285000::bigint, 275000::bigint, 1110, 3)$$,
	'with no client id, the figures cover every client');


-- As an employee: RLS hides every invoice ---------------------------------------------------------

set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000022", "role": "authenticated", "app_metadata": {"role": "employee"}}';

select results_eq(
	$$select outstanding_cents, overdue_cents, no_due_date_cents, unpaid_count, draft_count
	  from public.invoice_receivables_totals()$$,
	$$values (0::bigint, 0::bigint, 0::bigint, 0, 0)$$,
	'a non-admin sees zeros: the function reads through RLS');

-- One row even when nothing matches, so callers can read it with .single().
select is((select count(*) from public.invoice_receivables_totals())::int, 1,
	'always exactly one row');

select * from finish();

rollback;
