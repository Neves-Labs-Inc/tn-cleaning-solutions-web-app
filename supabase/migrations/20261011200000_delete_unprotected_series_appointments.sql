-- Series edit cleanup: delete the later appointments a "this and following" edit replaces, but
-- never a Protected appointment.
--
-- CONTEXT.md "Protected appointment", "Live claim". The invoice_appointments FK is ON DELETE
-- CASCADE, so deleting an appointment on a Live claim silently drops its line from a draft, issued
-- or paid invoice. updateAppointment plans the deletes from a read (planFutureVisitCleanup); this
-- function re-checks the plan under lock so a claim or clock-in that lands after the read wins.
--
-- CONTRACT
--
--   delete_unprotected_series_appointments(appointment_ids uuid[]) -> SETOF uuid
--     Deletes each named appointment that is still unarchived, scheduled, not manually completed
--     and has no Live claim (an unarchived, uncancelled invoice_appointments row), and returns the
--     ids it deleted. A named id it skips is left untouched, so the caller keeps that date.
--
--   * Locks the named appointments FOR UPDATE in id order first, the same order every invoice
--     write uses (private.invoice_lock_visits), so a claim either commits before the check and is
--     seen, or waits and then finds the appointment gone.
--   * SECURITY INVOKER: RLS applies, so only an admin (or the service role) deletes anything.
--   * A clock correction or odd-duration acknowledgement still refuses the delete through its
--     RESTRICT FK, as before.
--
-- DOWN.
--
--   DROP FUNCTION "public"."delete_unprotected_series_appointments"("uuid"[]);

CREATE FUNCTION "public"."delete_unprotected_series_appointments"("appointment_ids" "uuid"[]) RETURNS SETOF "uuid"
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
				AND NOT invoice_appointments.is_archived
				AND invoice_appointments.cancelled_at IS NULL
		)
	RETURNING appointments.id;
END;
$$;

ALTER FUNCTION "public"."delete_unprotected_series_appointments"("uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_unprotected_series_appointments"("uuid"[]) IS 'Deletes the named appointments that are still scheduled, not manually completed, unarchived and free of a Live claim, after locking them in id order, and returns the ids deleted. A "this and following" Series edit calls it so a Protected appointment, and the invoice line that would cascade with it, is never deleted.';
