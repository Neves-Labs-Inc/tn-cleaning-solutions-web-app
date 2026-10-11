-- Manual invoicing only (20261011150000): Automatic invoicing is off for every client and by
-- default, no Automatic draft is left (open or archived), and no appointment is Excluded.
--
-- Reads the state a db reset leaves, before this file adds fixtures, then checks that a new
-- client starts with the switch off. The migration's DML against existing drafts was checked by
-- hand (reset to the version before it, fixtures, migration up); the file can't be re-run here.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);


-- After the migration ---------------------------------------------------------------------------

select is(
	(select count(*)::integer from public.clients where automatic_invoicing),
	0, 'no client has Automatic invoicing on');

select is(
	(select count(*)::integer from public.invoices where is_automatic and status = 'draft'),
	0, 'no Automatic draft is left, open or archived');

select is(
	(select count(*)::integer from public.appointments where excluded_from_automatic),
	0, 'no appointment is Excluded');


-- Shape ----------------------------------------------------------------------------------------

select col_default_is('public', 'clients', 'automatic_invoicing', 'false',
	'clients.automatic_invoicing defaults to off');

select matches(
	col_description('public.clients'::regclass,
		(select attnum from pg_attribute
		 where attrelid = 'public.clients'::regclass and attname = 'automatic_invoicing')),
	'Off by default',
	'the automatic_invoicing comment says it is off by default');


-- A new client ---------------------------------------------------------------------------------

insert into public.clients (id, name) values
	('c7000000-0000-4000-8000-000000000001', 'pgTAP Manual Only Client');

select is(
	(select automatic_invoicing from public.clients where id = 'c7000000-0000-4000-8000-000000000001'),
	false, 'a new client starts with Automatic invoicing off');


select * from finish();

rollback;
