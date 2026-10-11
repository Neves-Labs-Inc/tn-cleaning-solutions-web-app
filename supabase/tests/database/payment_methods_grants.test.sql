-- payment_methods grants (20261010163000): authenticated keeps only SELECT, INSERT and UPDATE.
--
-- Asserts the privileges, then that the payment-methods page (read, add, rename, hide) and
-- recording a Payment with a new method still work as the admin.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test');

-- Automatic invoicing off, so the appointments_invoicing trigger opens no draft of its own.
insert into public.clients (id, name, automatic_invoicing) values
	('c0000000-0000-4000-8000-000000000001', 'pgTAP Client', false);

insert into public.jobs (id, name, hourly_rate_cents) values
	('b0000000-0000-4000-8000-000000000001', 'pgTAP Job', 4500);

insert into public.appointments (id, client_id, job_id, scheduled_date, scheduled_start_time, scheduled_end_time)
values ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
	'b0000000-0000-4000-8000-000000000001', '2026-10-01', '09:00', '11:00');

insert into public.invoices (id, client_id) values
	('10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001');

insert into public.invoice_appointments (invoice_id, appointment_id) values
	('10000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');


-- Grants ---------------------------------------------------------------------------------------

select table_privs_are('public', 'payment_methods', 'authenticated',
	array['INSERT', 'SELECT', 'UPDATE'],
	'authenticated has only SELECT, INSERT and UPDATE on payment_methods');
select table_privs_are('public', 'payment_methods', 'service_role',
	array['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
	'service_role keeps every privilege on payment_methods');


-- The payment-methods page and recording a Payment, as the admin -------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select ok((select count(*) from public.payment_methods) >= 4, 'an admin reads the payment methods');
select lives_ok($$ insert into public.payment_methods (name, sort_order) values ('pgTAP Wire', 90) $$,
	'an admin can add a payment method');
select lives_ok($$ update public.payment_methods set name = 'pgTAP Interac', is_hidden = true where name = 'pgTAP Wire' $$,
	'an admin can rename and hide a payment method');
select throws_ok($$ delete from public.payment_methods where name = 'pgTAP Interac' $$,
	'42501', null, 'not even an admin deletes a payment method');

select lives_ok($$
	select public.invoice_issue('10000000-0000-4000-8000-000000000001',
		'[{"appointment_id": "d0000000-0000-4000-8000-000000000001", "billed_amount_cents": 9000, "billed_rate_cents": 4500, "billed_minutes": 120}]',
		null)
$$, 'an admin issues the invoice');
select lives_ok($$
	select public.invoice_record_payment('10000000-0000-4000-8000-000000000001',
		(now() at time zone 'America/New_York')::date, 'pgTAP Bitcoin', null)
$$, 'an admin records a Payment with a new method');
select is((select count(*)::int from public.payment_methods where name = 'pgTAP Bitcoin'), 1,
	'the new method joins the list');

select * from finish();

rollback;
