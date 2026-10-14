-- The e-Transfer contact rename (20261014232000) and who can read a Cleaner's pay details: her Pay
-- rates, default Payout method and e-Transfer contact. Also pins the live-rate date clash the Pay
-- section maps to "She already has a rate from this date", on add and on Restore.
--
-- Fixtures are built here and rolled back; nothing depends on seed.sql or test-data.sql.

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);


-- Fixtures (as postgres, so RLS is bypassed) ---------------------------------------------------

insert into auth.users (id, email) values
	('a0000000-0000-4000-8000-000000000001', 'pgtap.admin@example.test'),
	('a0000000-0000-4000-8000-000000000002', 'pgtap.employee.a@example.test'),
	('a0000000-0000-4000-8000-000000000003', 'pgtap.employee.b@example.test');

insert into public.employees (id, user_id, full_name, is_active, is_archived, default_payout_method, e_transfer_contact) values
	('e0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000002', 'Employee A', true, false, 'Cash', 'a@pay.test'),
	('e0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000003', 'Employee B', true, false, 'e-Transfer', '647-555-0142');


-- The rename (catalog) -------------------------------------------------------------------------

select has_column('public', 'employees', 'e_transfer_contact', 'employees has e_transfer_contact');
select hasnt_column('public', 'employees', 'e_transfer_email', 'employees no longer has e_transfer_email');
select hasnt_column('public', 'employees_employee_view', 'e_transfer_contact',
	'employees view has no e_transfer_contact column');
select hasnt_column('public', 'employees_employee_view', 'default_payout_method',
	'employees view has no default_payout_method column');
select is_empty($$
	select c.table_name
	from information_schema.columns c
	join information_schema.views v on v.table_schema = c.table_schema and v.table_name = c.table_name
	where c.table_schema = 'public' and c.column_name = 'e_transfer_contact'
$$, 'no view exposes the e-Transfer contact');


-- As admin -------------------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated", "app_metadata": {"role": "admin"}}';

select results_eq($$
	select default_payout_method, e_transfer_contact from public.employees
	where id = 'e0000000-0000-4000-8000-00000000000b'
$$, $$ values ('e-Transfer'::text, '647-555-0142'::text) $$,
	'an admin reads a Cleaner''s default Payout method and e-Transfer contact');

select lives_ok($$
	insert into public.pay_rates (id, employee_id, hourly_rate_cents, effective_from)
	values ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a', 2400, '2026-10-05')
$$, 'an admin adds a Pay rate');
select throws_ok($$
	insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from)
	values ('e0000000-0000-4000-8000-00000000000a', 2500, '2026-10-05')
$$, '23505', null, 'a second live rate on the same date is refused');
select lives_ok($$
	update public.pay_rates set is_archived = true where id = '90000000-0000-4000-8000-000000000001'
$$, 'an admin archives a Pay rate');
select lives_ok($$
	insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from)
	values ('e0000000-0000-4000-8000-00000000000a', 2500, '2026-10-05')
$$, 'an archived rate doesn''t reserve its date');
select throws_ok($$
	update public.pay_rates set is_archived = false where id = '90000000-0000-4000-8000-000000000001'
$$, '23505', null, 'restoring a rate onto a live rate''s date is refused');


-- As an employee -------------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "a0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is_empty($$ select 1 from public.pay_rates $$, 'an employee reads no Pay rates, her own included');
select is_empty($$
	select default_payout_method, e_transfer_contact from public.employees
	where id = 'e0000000-0000-4000-8000-00000000000b'
$$, 'an employee reads no teammate''s default Payout method or e-Transfer contact');
-- Accepted (Franklin, ticket 04): her own row stays readable, as address already is. RLS can't
-- mask columns; hiding these would need column grants or a separate table.
select results_eq($$
	select default_payout_method, e_transfer_contact from public.employees
	where id = 'e0000000-0000-4000-8000-00000000000a'
$$, $$ values ('Cash'::text, 'a@pay.test'::text) $$,
	'an employee still reads her own row, pay details included');

reset role;

select * from finish();

rollback;
