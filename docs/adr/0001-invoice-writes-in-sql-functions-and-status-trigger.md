# Invoice writes are SQL functions, and billing follows appointment status through a trigger

Every invoice write transition (create, edit draft, issue, void, archive, record/edit/undo payment) is one `SECURITY DEFINER` plpgsql function that does all its writes in one transaction and checks the caller's role itself; TypeScript only prices lines (via `priceAppointments`) and calls the function. Joining an automatic draft on completion, dropping the line on reopen, and leaving a $0 Cancelled line on an issued invoice happen in a trigger on `appointments` status, not in the actions that change status. We chose this because the earlier server-action writes were non-atomic, and status is changed from several places (the `employee_clock` RPC and the admin form), so any app-side hook could be silently skipped.

## Considered Options

- **All in TypeScript server actions**: rejected; no transaction across PostgREST calls, so failures left orphan drafts and half-voided invoices.
- **All in SQL, including pricing**: rejected; it would duplicate the Live price rules from `priceAppointments`. Drafts store no price, so the trigger needs none.
- **Daily catch-up sweep (Vercel Cron)**: dropped; the trigger commits with the status change, so it can't miss a completion.

## Consequences

- Functions check `get_user_role()` themselves, because revoking `EXECUTE` crashes the Supabase PG 17.6 image (see `20260917120000_secure_appointment_employees_view.sql`).
- Lock order is appointment row, then invoice row, matching `employee_clock`.
- Invoice totals are derived from lines in `invoices_with_status`, never stored.
