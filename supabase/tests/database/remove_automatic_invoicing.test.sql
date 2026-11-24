-- Automatic invoicing removed (20261017120000): no draft is ever Automatic, the switch, the
-- Excluded flag and the join function are gone, and old Automatic invoices keep their flag.
--
-- The migration's conversion of leftover Automatic drafts can't be re-run here; it was checked by
-- hand (reset to 20261016120000, an Automatic draft with two lines, migration up). The trigger's
-- cancel, client-move and no-join behaviour is asserted in invoicing_trigger.test.sql, and the
-- Excluded rules' absence in invoice_drafts and invoice_transitions.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);


-- Gone ------------------------------------------------------------------------------------------

select hasnt_column('public', 'clients', 'automatic_invoicing', 'clients.automatic_invoicing is gone');
select hasnt_column('public', 'appointments', 'excluded_from_automatic', 'appointments.excluded_from_automatic is gone');
select hasnt_function('private', 'invoice_join_automatic_draft', 'invoice_join_automatic_draft is gone');
select hasnt_index('public', 'invoices', 'invoices_one_automatic_draft', 'the one-Automatic-draft index is gone');
select has_column('public', 'invoices', 'is_automatic', 'invoices.is_automatic stays for history');


-- A draft can't be Automatic ---------------------------------------------------------------------

insert into public.clients (id, name) values
	('c7000000-0000-4000-8000-000000000001', 'pgTAP No Automatic Client');

select throws_ok($$
	insert into public.invoices (client_id, status, is_automatic)
	values ('c7000000-0000-4000-8000-000000000001', 'draft', true)
$$, '23514', null, 'inserting an Automatic draft is refused');

insert into public.invoices (id, client_id) values
	('17000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001');

select throws_ok($$
	update public.invoices set is_automatic = true where id = '17000000-0000-4000-8000-000000000001'
$$, '23514', null, 'turning a draft Automatic is refused');


-- Issued, paid and void invoices keep the flag --------------------------------------------------

insert into public.invoices (id, client_id, status, is_automatic, invoice_number, issued_date, paid_date, payment_method) values
	('17000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'issued', true, 'INV-870-PGT2026', '2026-10-02', null, null),
	('17000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'paid', true, 'INV-871-PGT2026', '2026-10-02', '2026-10-03', 'Cash'),
	('17000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000001', 'void', true, 'INV-872-PGT2026', '2026-10-02', null, null);

select is(
	(select count(*)::integer from public.invoices_with_status
	 where id in ('17000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000003', '17000000-0000-4000-8000-000000000004')
		and is_automatic),
	3, 'issued, paid and void invoices keep their Automatic flag');

select throws_ok($$
	update public.invoices set status = 'draft', invoice_number = null, issued_date = null
	where id = '17000000-0000-4000-8000-000000000002'
$$, null, null, 'an Automatic invoice can''t go back to a draft');


-- Creating invoices never sets the flag ---------------------------------------------------------

insert into public.jobs (id, name, hourly_rate_cents) values
	('b7000000-0000-4000-8000-000000000001', 'pgTAP No Automatic Job', 4500);
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, status) values
	('d7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00', 'completed'),
	('d7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', '2026-10-01', '12:00', '14:00', 'completed');

set local role authenticated;
set local request.jwt.claims = '{"sub": "a7000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select lives_ok($$
	select public.invoice_create_draft('c7000000-0000-4000-8000-000000000001',
		array['d7000000-0000-4000-8000-000000000001'::uuid], null, null, null)
$$, 'an admin makes a draft by hand');

select lives_ok($$
	select public.invoice_mark_paid('c7000000-0000-4000-8000-000000000001',
		'[{"appointment_id": "d7000000-0000-4000-8000-000000000002", "billed_amount_cents": 9000}]'::jsonb,
		'2026-10-03', 'Cash', null, null)
$$, 'an admin marks a visit paid');

reset role;

select is(
	(select count(*)::integer from public.invoices
	 where client_id = 'c7000000-0000-4000-8000-000000000001' and status in ('draft', 'paid')
		and id not in ('17000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000003')
		and is_automatic),
	0, 'neither made an Automatic invoice');

-- A leftover Automatic draft: the migration's conversion step, run on a fixture (rolled back) ---

insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time, status) values
	('d7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', '2026-10-01', '15:00', '17:00', 'completed'),
	('d7000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', '2026-10-02', '09:00', '11:00', 'completed');

alter table public.invoices drop constraint invoices_no_automatic_draft;
insert into public.invoices (id, client_id, status, is_automatic) values
	('17000000-0000-4000-8000-0000000000a1', 'c7000000-0000-4000-8000-000000000001', 'draft', true);
insert into public.invoice_appointments (invoice_id, appointment_id) values
	('17000000-0000-4000-8000-0000000000a1', 'd7000000-0000-4000-8000-000000000003'),
	('17000000-0000-4000-8000-0000000000a1', 'd7000000-0000-4000-8000-000000000004');

-- Same statement as step 1 of the migration.
UPDATE "public"."invoices" SET "is_automatic" = false WHERE "is_automatic" AND "status" = 'draft';

select is((select is_automatic from public.invoices where id = '17000000-0000-4000-8000-0000000000a1'), false,
	'a leftover Automatic draft becomes an ordinary draft');
select is((select count(*)::integer from public.invoice_appointments
	where invoice_id = '17000000-0000-4000-8000-0000000000a1'), 2, 'and keeps all its lines');


select * from finish();

rollback;
