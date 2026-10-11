-- Series edit cleanup: an appointment with any invoice line is Protected, not only one on a Live
-- claim.
--
-- CONTEXT.md "Protected appointment". The invoice_appointments FK is ON DELETE CASCADE, so
-- deleting an appointment whose line was released (by a void or an archived draft) or Cancelled
-- (left on an issued invoice after a cancel and restore) dropped that line from its invoice and
-- erased the record of what the client was first billed. updateAppointment plans the deletes from
-- a read (planFutureVisitCleanup, hasInvoiceLine); this function re-checks the plan under lock.
--
-- CONTRACT
--
--   delete_unprotected_series_appointments(appointment_ids uuid[]) -> SETOF uuid
--     Deletes each named appointment that is still unarchived, scheduled, not manually completed
--     and has no invoice_appointments row at all (Live, Cancelled or released), and returns the
--     ids it deleted. A named id it skips is left untouched, so the caller keeps that date.
--
--   * Locks the named appointments FOR UPDATE in id order first, the same order every invoice
--     write uses (private.invoice_lock_visits), so a claim either commits before the check and is
--     seen, or waits and then finds the appointment gone.
--   * SECURITY INVOKER: RLS applies, so only an admin (or the service role) deletes anything.
--   * A clock correction or odd-duration acknowledgement still refuses the delete through its
--     RESTRICT FK, as before.
--
-- DOWN. Re-run the 20261011200000 body (Live claims only):
--
--   CREATE OR REPLACE FUNCTION "public"."delete_unprotected_series_appointments"("appointment_ids" "uuid"[]) RETURNS SETOF "uuid"
--       LANGUAGE "plpgsql"
--       SET "search_path" TO ''
--       AS $$
--   BEGIN
--   	PERFORM appointments.id
--   	FROM public.appointments
--   	WHERE appointments.id = ANY (delete_unprotected_series_appointments.appointment_ids)
--   	ORDER BY appointments.id
--   	FOR UPDATE;
--
--   	RETURN QUERY
--   	DELETE FROM public.appointments
--   	WHERE appointments.id = ANY (delete_unprotected_series_appointments.appointment_ids)
--   		AND NOT coalesce(appointments.is_archived, false)
--   		AND appointments.status = 'scheduled'
--   		AND NOT appointments.manually_completed
--   		AND NOT EXISTS (
--   			SELECT 1
--   			FROM public.invoice_appointments
--   			WHERE invoice_appointments.appointment_id = appointments.id
--   				AND NOT invoice_appointments.is_archived
--   				AND invoice_appointments.cancelled_at IS NULL
--   		)
--   	RETURNING appointments.id;
--   END;
--   $$;
--
--   COMMENT ON FUNCTION "public"."delete_unprotected_series_appointments"("uuid"[]) IS 'Deletes the named appointments that are still scheduled, not manually completed, unarchived and free of a Live claim, after locking them in id order, and returns the ids deleted. A "this and following" Series edit calls it so a Protected appointment, and the invoice line that would cascade with it, is never deleted.';

CREATE OR REPLACE FUNCTION "public"."delete_unprotected_series_appointments"("appointment_ids" "uuid"[]) RETURNS SETOF "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	PERFORM appointments.id
	FROM public.appointments
	WHERE appointments.id = ANY (delete_unprotected_series_appointments.appointment_ids)
	ORDER BY appointments.id
	FOR UPDATE;

	-- A separate statement, so its snapshot sees every claim committed while the lock waited.
	-- Any line protects, released or Cancelled too: the delete would cascade it off its invoice.
	RETURN QUERY
	DELETE FROM public.appointments
	WHERE appointments.id = ANY (delete_unprotected_series_appointments.appointment_ids)
		AND NOT coalesce(appointments.is_archived, false)
		AND appointments.status = 'scheduled'
		AND NOT appointments.manually_completed
		AND NOT EXISTS (
			SELECT 1
			FROM public.invoice_appointments
			WHERE invoice_appointments.appointment_id = appointments.id
		)
	RETURNING appointments.id;
END;
$$;

COMMENT ON FUNCTION "public"."delete_unprotected_series_appointments"("uuid"[]) IS 'Deletes the named appointments that are still scheduled, not manually completed, unarchived and free of any invoice line, after locking them in id order, and returns the ids deleted. A "this and following" Series edit calls it so a Protected appointment, and the invoice line that would cascade with it, is never deleted.';
