-- One-time scheduling and billing purge (client meeting 2026-10-13, requirements 6 and 7).
--
-- Do not run this file on its own: purge.sql wraps it in a transaction and commits only with
-- -v confirm=PURGE. It holds no BEGIN, COMMIT or ROLLBACK so the test can wrap it too.
-- Safe to re-run: on an already-purged database every "remove" count is 0 and it succeeds.
--
-- Removes every appointment, Series, session, invoice, invoice line, Clock correction, Odd
-- duration acknowledgement, invoice number counter and, once Payroll is deployed, every Pay run
-- with its claims and Adjustments, then every archived Job (whose client_job_pricing rows go with
-- it through ON DELETE CASCADE). Keeps clients, locations, employees, active Jobs, their
-- negotiated rates, payment methods and Pay rates.

-- The Payroll tables exist only once Payroll is deployed, so they are counted by name: 0 while
-- the table is missing. A temp function, gone with the session like the view below.
create or replace function pg_temp.purge_row_count(table_name text) returns bigint
	language plpgsql
	as $$
declare
	row_count bigint := 0;
begin
	if to_regclass(table_name) is not null then
		execute format('select count(*) from %s', table_name) into row_count;
	end if;
	return row_count;
end;
$$;

-- Counts per table. A temp view so BEFORE, AFTER and the final check read the same numbers;
-- it disappears with the session.
create or replace temp view purge_counts as
select position, table_name, action, row_count
from (values
	(1, 'appointments', 'remove', (select count(*) from public.appointments)),
	(2, 'recurrence_series', 'remove', (select count(*) from public.recurrence_series)),
	(3, 'appointment_employees', 'remove', (select count(*) from public.appointment_employees)),
	(4, 'invoice_appointments', 'remove', (select count(*) from public.invoice_appointments)),
	(5, 'invoices', 'remove', (select count(*) from public.invoices)),
	(6, 'clock_corrections', 'remove', (select count(*) from public.clock_corrections)),
	(7, 'odd_duration_acknowledgements', 'remove', (select count(*) from public.odd_duration_acknowledgements)),
	(8, 'invoice_number_counters', 'remove', (select count(*) from public.invoice_number_counters)),
	(9, 'pay_run_lines', 'remove', pg_temp.purge_row_count('public.pay_run_lines')),
	(10, 'pay_adjustments', 'remove', pg_temp.purge_row_count('public.pay_adjustments')),
	(11, 'pay_runs', 'remove', pg_temp.purge_row_count('public.pay_runs')),
	(12, 'jobs (archived)', 'remove', (select count(*) from public.jobs where is_archived = true)),
	(13, 'client_job_pricing (archived jobs)', 'remove',
		(select count(*) from public.client_job_pricing cjp
		 join public.jobs j on j.id = cjp.job_id where j.is_archived = true)),
	(14, 'clients', 'keep', (select count(*) from public.clients)),
	(15, 'client_locations', 'keep', (select count(*) from public.client_locations)),
	(16, 'employees', 'keep', (select count(*) from public.employees)),
	(17, 'jobs (active)', 'keep', (select count(*) from public.jobs where is_archived is not true)),
	(18, 'client_job_pricing (active jobs)', 'keep',
		(select count(*) from public.client_job_pricing cjp
		 join public.jobs j on j.id = cjp.job_id where j.is_archived is not true)),
	(19, 'payment_methods', 'keep', (select count(*) from public.payment_methods)),
	(20, 'pay_rates', 'keep', pg_temp.purge_row_count('public.pay_rates'))
) as counts (position, table_name, action, row_count);

\echo
\echo '== BEFORE purge: rows per table =='
select table_name, action, row_count from purge_counts order by position;

-- TRUNCATE fires no row triggers, so the append-only guard on clock_corrections and
-- odd_duration_acknowledgements and the status/invoicing triggers stay out of the way. The FKs
-- among these tables hold because they go together; the Payroll tables join the list only once
-- they exist (pay_run_lines and pay_adjustments reference appointment_employees). RESTRICT is
-- the drift guard: if a table outside this list references any of them, this errors and the
-- transaction changes nothing.
do $$
declare
	purged_tables text;
begin
	select string_agg(purged.table_name, ', ' order by purged.position)
	into purged_tables
	from unnest(array[
		'public.appointments',
		'public.recurrence_series',
		'public.appointment_employees',
		'public.invoice_appointments',
		'public.invoices',
		'public.clock_corrections',
		'public.odd_duration_acknowledgements',
		'public.invoice_number_counters',
		'public.pay_run_lines',
		'public.pay_adjustments',
		'public.pay_runs'
	]) with ordinality as purged(table_name, position)
	where to_regclass(purged.table_name) is not null;

	execute 'truncate table ' || purged_tables || ' restrict';
end;
$$;

-- After the truncate only client_job_pricing still references Jobs; it cascades.
delete from public.jobs where is_archived = true;

\echo
\echo '== AFTER purge: rows per table =='
select table_name, action, row_count from purge_counts order by position;

do $$
declare
	leftover text;
begin
	select string_agg(table_name || ' (' || row_count || ')', ', ' order by position)
	into leftover
	from purge_counts
	where action = 'remove' and row_count <> 0;

	if leftover is not null then
		raise exception 'Purge incomplete, rows left in: %', leftover;
	end if;
end;
$$;
