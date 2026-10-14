-- One-time scheduling and billing purge (client meeting 2026-10-13, requirements 6 and 7).
--
-- Do not run this file on its own: purge.sql wraps it in a transaction and commits only with
-- -v confirm=PURGE. It holds no BEGIN, COMMIT or ROLLBACK so the test can wrap it too.
-- Safe to re-run: on an already-purged database every "remove" count is 0 and it succeeds.
--
-- Removes every appointment, Series, session, invoice, invoice line, Clock correction, Odd
-- duration acknowledgement and invoice number counter, then every archived Job (whose
-- client_job_pricing rows go with it through ON DELETE CASCADE). Keeps clients, locations,
-- employees, active Jobs, their negotiated rates and payment methods.

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
	(9, 'jobs (archived)', 'remove', (select count(*) from public.jobs where is_archived = true)),
	(10, 'client_job_pricing (archived jobs)', 'remove',
		(select count(*) from public.client_job_pricing cjp
		 join public.jobs j on j.id = cjp.job_id where j.is_archived = true)),
	(11, 'clients', 'keep', (select count(*) from public.clients)),
	(12, 'client_locations', 'keep', (select count(*) from public.client_locations)),
	(13, 'employees', 'keep', (select count(*) from public.employees)),
	(14, 'jobs (active)', 'keep', (select count(*) from public.jobs where is_archived is not true)),
	(15, 'client_job_pricing (active jobs)', 'keep',
		(select count(*) from public.client_job_pricing cjp
		 join public.jobs j on j.id = cjp.job_id where j.is_archived is not true)),
	(16, 'payment_methods', 'keep', (select count(*) from public.payment_methods))
) as counts (position, table_name, action, row_count);

\echo
\echo '== BEFORE purge: rows per table =='
select table_name, action, row_count from purge_counts order by position;

-- TRUNCATE fires no row triggers, so the append-only guard on clock_corrections and
-- odd_duration_acknowledgements and the status/invoicing triggers stay out of the way. The FKs
-- among these 8 tables hold because they go together. RESTRICT is the drift guard: if a table
-- outside this list references any of them, this errors and the transaction changes nothing.
truncate table
	public.appointments,
	public.recurrence_series,
	public.appointment_employees,
	public.invoice_appointments,
	public.invoices,
	public.clock_corrections,
	public.odd_duration_acknowledgements,
	public.invoice_number_counters
restrict;

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
