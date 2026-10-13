-- Existing appointments re-derive under the whole-crew rule.
--
-- 20261012120000 made a visit complete only once every Cleaner on its crew has clocked in and out,
-- but did not backfill, so visits completed under the old rule still show Completed although a
-- Cleaner never clocked. CONTEXT.md "Appointment status", "Manual completion".
--
-- CONTRACT
--
--   * private.backfill_whole_crew_status() runs once here and RAISEs its counts as a NOTICE. It is
--     kept so pgTAP can pin the rule, and it is idempotent: a second call reports (0, 0).
--   * Step 1, protect billed visits (flagged_count): a non-archived completed visit, not already
--     manually completed, that the clocks alone would not complete, and that has a Live claim
--     (an invoice_appointments row neither archived nor cancelled) on an issued or paid invoice,
--     gets manually_completed = true. Its status stays completed, so a sent or paid invoice never
--     shows an Upcoming line.
--   * Step 2, re-derive (status_changed_count): every non-cancelled, non-archived row whose status
--     differs from private.appointment_derived_status(id, manually_completed) takes the derived
--     value. So a would-reopen visit with no claim, or only a draft, void, released or Cancelled
--     line, goes back to in_progress (or scheduled).
--   * Cancelled and archived rows are never touched, nor is a manually completed one (it derives
--     completed).
--   * private.backfill_appointment_status() (20261009120000) is deliberately not called: its first
--     step flags every would-reopen row, billed or not.
--   * Writes go through the existing triggers. A reopened visit leaves only an Automatic draft
--     (dormant since 20261011150000); a manual draft keeps it as an Upcoming line. completed_at is
--     not cleared.
--
-- DOWN. Statuses need no undo: they re-derive through the triggers anyway. Which rows this flagged
-- is not recorded, so the flags it set can't be undone automatically.
--
--   DROP FUNCTION "private"."backfill_whole_crew_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer);


CREATE OR REPLACE FUNCTION "private"."backfill_whole_crew_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	-- Already on an issued or paid invoice: reopening it would put an Upcoming line on a bill the
	-- client has, so it stays completed as a Manual completion.
	UPDATE public.appointments
	SET manually_completed = true
	WHERE appointments.status = 'completed'
		AND NOT appointments.is_archived
		AND NOT appointments.manually_completed
		AND private.appointment_derived_status(appointments.id, false) <> 'completed'
		AND EXISTS (
			SELECT 1
			FROM public.invoice_appointments
			JOIN public.invoices ON invoices.id = invoice_appointments.invoice_id
			WHERE invoice_appointments.appointment_id = appointments.id
				AND NOT invoice_appointments.is_archived
				AND invoice_appointments.cancelled_at IS NULL
				AND invoices.status IN ('issued', 'paid')
		);
	GET DIAGNOSTICS flagged_count = ROW_COUNT;

	UPDATE public.appointments
	SET status = private.appointment_derived_status(appointments.id, appointments.manually_completed)
	WHERE appointments.status <> 'cancelled'
		AND NOT appointments.is_archived
		AND appointments.status IS DISTINCT FROM private.appointment_derived_status(appointments.id, appointments.manually_completed);
	GET DIAGNOSTICS status_changed_count = ROW_COUNT;

	RAISE NOTICE 'whole-crew status backfill: % row(s) flagged manually_completed, % status(es) changed',
		flagged_count, status_changed_count;
END;
$$;

ALTER FUNCTION "private"."backfill_whole_crew_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."backfill_whole_crew_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer) FROM PUBLIC;

COMMENT ON FUNCTION "private"."backfill_whole_crew_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer) IS 'One-off backfill from 20261013120000, kept so pgTAP can pin the rule: flags non-archived completed rows the clocks would not complete that have a Live claim on an issued or paid invoice, then re-derives every other non-cancelled, non-archived row under the whole-crew rule. Idempotent.';

SELECT * FROM "private"."backfill_whole_crew_status"();
