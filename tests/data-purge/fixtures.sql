-- Purge test fixtures. Included inside an open transaction that the test always rolls back.
--
-- Starts from a clean slate so the expected counts are known literals, whatever the local
-- database already holds: the TRUNCATE below is rolled back with everything else.

truncate public.appointments, public.recurrence_series, public.appointment_employees,
	public.invoice_appointments, public.invoices, public.clock_corrections,
	public.odd_duration_acknowledgements, public.invoice_number_counters, public.jobs,
	public.client_job_pricing, public.clients, public.client_locations, public.employees,
	public.payment_methods, public.pay_rates, public.pay_runs, public.pay_run_lines,
	public.pay_adjustments;

insert into auth.users (id, email) values
	('a7000000-0000-4000-8000-000000000001', 'purge.test.admin@example.test'),
	('a7000000-0000-4000-8000-000000000002', 'purge.test.employee.a@example.test'),
	('a7000000-0000-4000-8000-000000000003', 'purge.test.employee.b@example.test');

-- Kept: 2 clients, 2 locations, 2 employees, 2 payment methods.
insert into public.employees (id, user_id, full_name) values
	('e7000000-0000-4000-8000-00000000000a', 'a7000000-0000-4000-8000-000000000002', 'Employee A'),
	('e7000000-0000-4000-8000-00000000000b', 'a7000000-0000-4000-8000-000000000003', 'Employee B');

insert into public.clients (id, name) values
	('c7000000-0000-4000-8000-000000000001', 'Client One'),
	('c7000000-0000-4000-8000-000000000002', 'Client Two');

insert into public.client_locations (id, client_id, address) values
	('17000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', '1 One St'),
	('17000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000002', '2 Two St');

insert into public.payment_methods (name, sort_order) values ('Cash', 1), ('Cheque', 2);

-- Jobs: two active (is_archived false and null), two archived.
insert into public.jobs (id, name, hourly_rate_cents, is_archived) values
	('b7000000-0000-4000-8000-000000000001', 'Active job', 4000, false),
	('b7000000-0000-4000-8000-000000000002', 'Active job, null flag', 4500, null),
	('b7000000-0000-4000-8000-000000000003', 'Archived job', 5000, true),
	('b7000000-0000-4000-8000-000000000004', 'Archived job two', 5500, true);

-- Negotiated rates: 2 on active jobs (kept), 3 on archived jobs (removed).
insert into public.client_job_pricing (client_id, job_id, hourly_rate_cents, effective_from) values
	('c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 4100, '2026-01-01'),
	('c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 4600, '2026-01-01'),
	('c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000003', 5100, '2026-01-01'),
	('c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000003', 5200, '2026-02-01'),
	('c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000004', 5600, '2026-01-01');

-- 2 Series. Built through jsonb_populate_record, which ignores keys the table lacks, so the
-- fixture fits both the `frequency` schema and the in-flight `interval_unit` one.
insert into public.recurrence_series
select series_row.*
from (values
	('{"id": "57000000-0000-4000-8000-000000000001", "frequency": "weekly", "interval_unit": "week",
	   "interval_count": 1, "start_date": "2026-09-01", "is_active": true, "is_archived": false,
	   "client_id": "c7000000-0000-4000-8000-000000000001", "job_id": "b7000000-0000-4000-8000-000000000001"}'::jsonb),
	('{"id": "57000000-0000-4000-8000-000000000002", "frequency": "monthly", "interval_unit": "month",
	   "interval_count": 1, "start_date": "2026-09-01", "is_active": true, "is_archived": false,
	   "client_id": "c7000000-0000-4000-8000-000000000002", "job_id": "b7000000-0000-4000-8000-000000000003"}'::jsonb)
) as fixture (series),
	jsonb_populate_record(null::public.recurrence_series, fixture.series) as series_row;

-- 7 appointments: every status, manually completed, archived, and one on an archived job.
insert into public.appointments
	(id, client_id, job_id, recurrence_series_id, location_id, scheduled_date, scheduled_start_time, scheduled_end_time,
	 status, manually_completed, is_archived) values
	('d7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001',
	 '57000000-0000-4000-8000-000000000001', '17000000-0000-4000-8000-000000000001', '2026-11-02', '09:00', '11:00', 'scheduled', false, false),
	('d7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001',
	 null, null, '2026-10-01', '09:00', '11:00', 'in_progress', false, false),
	('d7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002',
	 null, null, '2026-09-15', '09:00', '11:00', 'completed', false, false),
	('d7000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001',
	 null, null, '2026-09-16', '09:00', '11:00', 'cancelled', false, false),
	('d7000000-0000-4000-8000-000000000005', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001',
	 null, null, '2026-09-17', '09:00', '11:00', 'completed', true, false),
	('d7000000-0000-4000-8000-000000000006', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000002',
	 null, null, '2026-09-18', '09:00', '11:00', 'scheduled', false, true),
	('d7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000003',
	 '57000000-0000-4000-8000-000000000002', null, '2026-09-19', '09:00', '11:00', 'completed', true, false);

-- 3 sessions: one clocked in, one clocked in and out, one Removed.
insert into public.appointment_employees (id, appointment_id, employee_id, clocked_in_at, clocked_out_at, is_archived) values
	('f7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-00000000000a',
	 '2026-10-01 13:00+00', null, false),
	('f7000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-00000000000a',
	 '2026-09-15 13:00+00', '2026-09-15 15:00+00', false),
	('f7000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000003', 'e7000000-0000-4000-8000-00000000000b',
	 null, null, true);

insert into public.clock_corrections (appointment_employee_id, corrected_by, corrected_by_name, reason) values
	('f7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'Pat Admin', 'fixture');

insert into public.odd_duration_acknowledgements
	(appointment_employee_id, acknowledged_by, acknowledged_by_name, clock_in, clock_out, note) values
	('f7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000001', 'Pat Admin',
	 '2026-09-15 13:00+00', '2026-09-15 15:00+00', 'fixture');

-- 6 invoices: draft, issued, paid, void, archived, and an empty draft with no lines.
insert into public.invoices
	(id, client_id, status, invoice_number, issued_date, paid_date, payment_method, is_archived) values
	('97000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002', 'draft', null, null, null, null, false),
	('97000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001', 'issued', 'PURGE-TEST-002', '2026-09-20', null, null, false),
	('97000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000002', 'paid', 'PURGE-TEST-003', '2026-09-20', '2026-09-25', 'Cash', false),
	('97000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000001', 'void', 'PURGE-TEST-004', '2026-09-20', null, null, false),
	('97000000-0000-4000-8000-000000000005', 'c7000000-0000-4000-8000-000000000001', 'issued', 'PURGE-TEST-005', '2026-09-21', null, null, true),
	('97000000-0000-4000-8000-000000000006', 'c7000000-0000-4000-8000-000000000001', 'draft', null, null, null, null, false);

-- 4 lines: live, released (archived by a void), cancelled, and one on a draft.
insert into public.invoice_appointments (invoice_id, appointment_id, is_archived, cancelled_at) values
	('97000000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000003', false, null),
	('97000000-0000-4000-8000-000000000004', 'd7000000-0000-4000-8000-000000000003', true, null),
	('97000000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000004', false, '2026-09-26 12:00+00'),
	('97000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000005', false, null);

insert into public.invoice_number_counters (year, last_value) values (2026, 5);

-- Payroll: 1 Pay rate (kept), 2 Pay runs (paid and finalized), 2 claims, 1 Adjustment on a session.
insert into public.pay_rates (employee_id, hourly_rate_cents, effective_from) values
	('e7000000-0000-4000-8000-00000000000a', 2000, '2026-10-05');

insert into public.pay_runs
	(id, employee_id, period_start, kind, status, finalized_at, paid_on, payout_method, paid_at, created_by) values
	('87000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-00000000000a', '2026-10-05', 'regular', 'paid',
	 '2026-10-19 12:00+00', '2026-10-20', 'e-Transfer', '2026-10-20 12:00+00', 'a7000000-0000-4000-8000-000000000001'),
	('87000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-00000000000b', '2026-10-05', 'regular', 'finalized',
	 '2026-10-19 12:00+00', null, null, null, 'a7000000-0000-4000-8000-000000000001');

insert into public.pay_run_lines
	(pay_run_id, appointment_employee_id, scheduled_date, client_name, job_name, minutes, rate_cents, amount_cents) values
	('87000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000002', '2026-09-15', 'Client One',
	 'Active job, null flag', 120, 2000, 4000),
	('87000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-000000000003', null, null, null, null, null, null);

insert into public.pay_adjustments (pay_run_id, amount_cents, reason, appointment_employee_id, created_by) values
	('87000000-0000-4000-8000-000000000001', 500, 'fixture', 'f7000000-0000-4000-8000-000000000002',
	 'a7000000-0000-4000-8000-000000000001');
