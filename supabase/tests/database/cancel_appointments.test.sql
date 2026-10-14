-- cancel_appointments (20261014184700): a scoped cancel, re-checked under lock.
--
-- Called as the admin and as an employee. Asserts the function's answer and the rows it leaves in
-- appointments, invoices and invoice_appointments; the billing itself is the appointments_invoicing
-- trigger's (invoicing_trigger.test.sql), checked here only as far as this function relies on it.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a7000000-0000-4000-8000-000000000001', 'pgtap.cancel.admin@example.test'),
	('a7000000-0000-4000-8000-000000000002', 'pgtap.cancel.employee@example.test');

-- Automatic invoicing off, so completing a fixture visit opens no draft of its own.
insert into public.clients (id, name, automatic_invoicing) values
	('c7000000-0000-4000-8000-000000000001', 'pgTAP Cancel Client', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b7000000-0000-4000-8000-000000000001', 'pgTAP Cancel Job', 4500);

-- d01..d08:
--   d01 completed, on paid invoice P           -> skipped
--   d02 completed, alone on issued invoice I1  -> cancelled, I1 voided
--   d03 alone on draft D                       -> cancelled, D deleted
--   d04 on issued invoice I2 with d06          -> cancelled, I2 stays issued
--   d05 already cancelled                      -> left out
--   d06 on I2, not named                       -> untouched
--   d07 archived                               -> left out
--   d08 no invoice line                        -> cancelled
insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
select ('d7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
	'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001',
	('2026-10-01'::date + n), '09:00', '11:00'
from generate_series(1, 8) n;

update public.appointments set manually_completed = true, status = 'completed'
where id in ('d7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002');
update public.appointments set status = 'cancelled' where id = 'd7000000-0000-4000-8000-000000000005';
update public.appointments set is_archived = true where id = 'd7000000-0000-4000-8000-000000000007';

insert into public.invoices (id, client_id, status, invoice_number, issued_date, paid_date, payment_method) values
	('17000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'paid', 'INV-901-PGC2026', '2026-10-02', '2026-10-03', 'Cash'),
	('17000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'issued', 'INV-902-PGC2026', '2026-10-02', null, null),
	('17000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'draft', null, null, null, null),
	('17000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000001', 'issued', 'INV-904-PGC2026', '2026-10-02', null, null);

insert into public.invoice_appointments (invoice_id, appointment_id, billed_amount_cents) values
	('17000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001', 9000),
	('17000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002', 9000),
	('17000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000003', null),
	('17000000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-000000000004', 9000),
	('17000000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-000000000006', 9000);


-- Helpers --------------------------------------------------------------------------------------

-- Runs a statement as the current role and returns the code (DETAIL) it raised, or null.
create function public.pgtap_cancel_refusal(statement text) returns text
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

create function public.pgtap_cancel_visit(n integer) returns uuid
	language sql immutable
	as $$ select ('d7000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;


-- Employees are refused --------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a7000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is(public.pgtap_cancel_refusal($$
	select public.cancel_appointments(array[public.pgtap_cancel_visit(8)])
$$), 'not_admin', 'an employee gets not_admin');

reset role;
select is((select status from public.appointments where id = public.pgtap_cancel_visit(8)),
	'scheduled', 'the refused call changed nothing');


-- The admin cancels -----------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a7000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select is(
	public.cancel_appointments(array[
		public.pgtap_cancel_visit(8), public.pgtap_cancel_visit(1), public.pgtap_cancel_visit(2),
		public.pgtap_cancel_visit(3), public.pgtap_cancel_visit(4), public.pgtap_cancel_visit(5),
		public.pgtap_cancel_visit(7), 'd7000000-0000-4000-8000-000000000099'
	]),
	jsonb_build_object(
		'cancelled', jsonb_build_array(
			public.pgtap_cancel_visit(2), public.pgtap_cancel_visit(3), public.pgtap_cancel_visit(4),
			public.pgtap_cancel_visit(8)),
		'skipped', jsonb_build_array(jsonb_build_object('id', public.pgtap_cancel_visit(1), 'reason', 'paid_invoice')),
		'invoice_ids', jsonb_build_array(
			'17000000-0000-4000-8000-000000000002', '17000000-0000-4000-8000-000000000003',
			'17000000-0000-4000-8000-000000000004')
	),
	'cancels in id order, skips the paid one, leaves out the cancelled, archived and missing ones'
);

reset role;

select results_eq($$
	select status from public.appointments
	where id between public.pgtap_cancel_visit(1) and public.pgtap_cancel_visit(8)
	order by id
$$, $$ values ('completed'::text), ('cancelled'), ('cancelled'), ('cancelled'), ('cancelled'), ('scheduled'), ('scheduled'), ('cancelled') $$,
	'only the named, cancellable visits are cancelled');

select is((select is_archived from public.appointments where id = public.pgtap_cancel_visit(7)),
	true, 'the archived visit stays archived');

select results_eq($$
	select status, (select count(*) from public.invoice_appointments ia
		where ia.invoice_id = i.id and ia.cancelled_at is null and not ia.is_archived)
	from public.invoices i where i.id = '17000000-0000-4000-8000-000000000001'
$$, $$ values ('paid'::text, 1::bigint) $$, 'the paid invoice keeps its live line');

select results_eq($$
	select i.status, ia.is_archived, ia.cancelled_at is not null
	from public.invoices i join public.invoice_appointments ia on ia.invoice_id = i.id
	where i.id = '17000000-0000-4000-8000-000000000002'
$$, $$ values ('void'::text, true, true) $$,
	'an issued invoice left with nothing to charge is voided, its Cancelled line released');

select is_empty($$ select 1 from public.invoices where id = '17000000-0000-4000-8000-000000000003' $$,
	'the emptied draft is deleted');

select results_eq($$
	select ia.appointment_id, i.status, ia.cancelled_at is not null
	from public.invoices i join public.invoice_appointments ia on ia.invoice_id = i.id
	where i.id = '17000000-0000-4000-8000-000000000004'
	order by ia.appointment_id
$$, $$ values
	('d7000000-0000-4000-8000-000000000004'::uuid, 'issued'::text, true),
	('d7000000-0000-4000-8000-000000000006'::uuid, 'issued'::text, false)
$$, 'an issued invoice with something left keeps it, with a Cancelled line for the cancelled visit');

-- A second call finds everything already cancelled or skipped.
set local role authenticated;
select is(
	public.cancel_appointments(array[public.pgtap_cancel_visit(1), public.pgtap_cancel_visit(2)]),
	jsonb_build_object(
		'cancelled', '[]'::jsonb,
		'skipped', jsonb_build_array(jsonb_build_object('id', public.pgtap_cancel_visit(1), 'reason', 'paid_invoice')),
		'invoice_ids', '[]'::jsonb
	),
	'a repeat leaves the cancelled visit out and skips the paid one again'
);
reset role;


select * from finish();

rollback;
