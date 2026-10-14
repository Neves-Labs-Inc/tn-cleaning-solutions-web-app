-- Hard delete of appointments by scope: an admin removes visits for good, with everything linked
-- to them.
--
-- .scratch/appointment-cancel-delete-scopes ticket 03; ADR docs/adr/0001-invoice-writes-in-sql-
-- functions-and-status-trigger.md; CONTEXT.md "Deleted appointment", "Clock correction",
-- "Odd duration".
--
-- ACCEPTED TRADE-OFF (Franklin, 2026-10-13). 20261010120000 records that Ontario ESA and CRA rules
-- want Clock corrections kept 6 years. Deleting a visit through delete_appointments now destroys
-- its clock-ins, Clock corrections and Odd duration acknowledgements for good. It is the only path
-- that can: every other UPDATE or DELETE on those two tables is still refused.
--
-- CONTRACT
--
--   * private.refuse_append_only_change (the BEFORE UPDATE OR DELETE trigger on clock_corrections
--     and odd_duration_acknowledgements) lets a DELETE through only while the transaction-local
--     setting app.deleting_appointments is 'on'. Only delete_appointments sets it, around its own
--     two deletes, and turns it off again. A PostgREST client can't set it: PostgREST only sets
--     request.* settings, never runs SET, and set_config lives in pg_catalog, which isn't an
--     exposed schema. UPDATE is refused always, whatever the setting.
--   * delete_appointments(p_appointment_ids, p_series_id, p_series_change, p_end_before) -> jsonb
--       { "deleted": [ids], "skipped": [{ "id", "reason": "paid_invoice" }], "invoice_ids": [ids] }
--     SECURITY DEFINER, search_path '', owner postgres, one transaction. Order:
--       1. not_admin (invoice_error) unless get_user_role() = 'admin'. p_series_change must be
--          'none', 'end_before' (needs p_series_id and p_end_before) or 'delete' (needs
--          p_series_id); anything else raises 22023, a programmer error.
--       2. Locks, each in id order: the visits' crew rows, the visits, then the invoices their lines
--          are on. Assignment before appointment is the order employee_clock and
--          correct_session_clocks take; appointment before invoice is ADR 0001's.
--       3. Missing or archived ids are left out silently. An id with any invoice_appointments row
--          (Live, Cancelled or released) on a paid invoice is skipped as paid_invoice: a paid
--          invoice's total never changes.
--       4. For the rest: their clock_corrections and odd_duration_acknowledgements (through the
--          narrowed guard; their RESTRICT FKs would refuse the crew cascade otherwise), then the
--          appointments. appointment_employees and invoice_appointments go by ON DELETE CASCADE.
--          The crew trigger (appointment_employees_derive_status) fires for each cascaded crew row
--          but finds its appointment already gone and does nothing, so no status update runs and
--          appointments_invoicing never fires: a deleted completed visit can't join an Automatic
--          draft or run the cancel path. This is why the crew rows are not deleted first.
--       5. Each invoice that lost a line: an unarchived draft with no live line left is deleted
--          (private.invoice_delete_if_empty); an issued invoice with no live line left becomes void
--          with its lines released, as the status trigger does when its last line is cancelled; a
--          void invoice, or an archived draft (its lines were all released), is left as it is.
--       6. Only when at least one visit was deleted, the Series change: 'end_before' sets
--          recurrence_series.end_date to the day before p_end_before (never later than it was);
--          'delete' deletes the Series row, and any skipped visits stay, now standalone, through
--          ON DELETE SET NULL; 'none' leaves it alone.
--     "invoice_ids" lists every invoice that lost a line, including drafts it deleted.
--
-- EXECUTE is not revoked from anon or authenticated: revoking it crashes the Supabase PG 17.6 image
-- (see 20260917120000_secure_appointment_employees_view.sql). The function checks the role itself.
--
-- DOWN. Deleted visits and their records don't come back.
--
--   DROP FUNCTION "public"."delete_appointments"("uuid"[], "uuid", "text", "date");
--   CREATE OR REPLACE FUNCTION "private"."refuse_append_only_change"() RETURNS "trigger"
--       LANGUAGE "plpgsql"
--       SET "search_path" TO ''
--       AS $$
--   BEGIN
--   	RAISE EXCEPTION USING MESSAGE = TG_TABLE_NAME || ' is append-only: rows can''t be changed or deleted.',
--   		ERRCODE = 'P0001';
--   END;
--   $$;
--   COMMENT ON FUNCTION "private"."refuse_append_only_change"() IS 'BEFORE UPDATE OR DELETE trigger for the append-only audit tables: always raises, whatever the role.';


-- 1. Narrowed append-only guard ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."refuse_append_only_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	-- Set only by delete_appointments, transaction-local, around its own deletes.
	IF TG_OP = 'DELETE' AND current_setting('app.deleting_appointments', true) = 'on' THEN
		RETURN OLD;
	END IF;

	RAISE EXCEPTION USING MESSAGE = TG_TABLE_NAME || ' is append-only: rows can''t be changed or deleted.',
		ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION "private"."refuse_append_only_change"() IS 'BEFORE UPDATE OR DELETE trigger for the append-only audit tables: always raises, whatever the role, except a DELETE made inside delete_appointments (app.deleting_appointments = on).';


-- 2. delete_appointments -------------------------------------------------------------------------

CREATE FUNCTION "public"."delete_appointments"("p_appointment_ids" "uuid"[], "p_series_id" "uuid",
    "p_series_change" "text", "p_end_before" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	requested_ids uuid[] := coalesce(p_appointment_ids, '{}');
	skipped_ids uuid[];
	deleted_ids uuid[];
	touched_invoice_ids uuid[];
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.invoice_error('not_admin');
	END IF;

	IF p_series_change IS NULL OR p_series_change NOT IN ('none', 'end_before', 'delete') THEN
		RAISE EXCEPTION USING MESSAGE = 'Unknown series change: ' || coalesce(p_series_change, 'null'),
			ERRCODE = '22023';
	END IF;
	IF p_series_change <> 'none' AND p_series_id IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = 'A series change needs a series id.', ERRCODE = '22023';
	END IF;
	IF p_series_change = 'end_before' AND p_end_before IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = 'Ending a series needs a date.', ERRCODE = '22023';
	END IF;

	-- Crew rows first, the order employee_clock and correct_session_clocks lock in; the cascade
	-- below would otherwise take them after the appointment and could deadlock a Cleaner clocking.
	PERFORM appointment_employees.id
	FROM public.appointment_employees
	WHERE appointment_employees.appointment_id = ANY (requested_ids)
	ORDER BY appointment_employees.id
	FOR UPDATE;

	PERFORM private.invoice_lock_visits(requested_ids);

	-- No line can join these visits now: every line writer locks the visit first.
	PERFORM invoices.id
	FROM public.invoices
	WHERE invoices.id IN (
		SELECT invoice_appointments.invoice_id
		FROM public.invoice_appointments
		WHERE invoice_appointments.appointment_id = ANY (requested_ids)
	)
	ORDER BY invoices.id
	FOR UPDATE;

	-- Separate statements from the locks, so they see everything committed while the locks waited.
	-- Any line on a paid invoice skips, Cancelled or released too: the delete would cascade it off.
	SELECT coalesce(array_agg(appointments.id ORDER BY appointments.id), '{}')
	INTO skipped_ids
	FROM public.appointments
	WHERE appointments.id = ANY (requested_ids)
		AND NOT coalesce(appointments.is_archived, false)
		AND EXISTS (
			SELECT 1
			FROM public.invoice_appointments
			JOIN public.invoices ON invoices.id = invoice_appointments.invoice_id
			WHERE invoice_appointments.appointment_id = appointments.id
				AND invoices.status = 'paid'
		);

	SELECT coalesce(array_agg(appointments.id ORDER BY appointments.id), '{}')
	INTO deleted_ids
	FROM public.appointments
	WHERE appointments.id = ANY (requested_ids)
		AND NOT coalesce(appointments.is_archived, false)
		AND appointments.id <> ALL (skipped_ids);

	SELECT coalesce(array_agg(DISTINCT invoice_appointments.invoice_id), '{}')
	INTO touched_invoice_ids
	FROM public.invoice_appointments
	WHERE invoice_appointments.appointment_id = ANY (deleted_ids);

	-- Their RESTRICT FKs would refuse the crew cascade, so the audit rows go first.
	PERFORM set_config('app.deleting_appointments', 'on', true);

	DELETE FROM public.clock_corrections
	WHERE clock_corrections.appointment_employee_id IN (
		SELECT appointment_employees.id
		FROM public.appointment_employees
		WHERE appointment_employees.appointment_id = ANY (deleted_ids)
	);

	DELETE FROM public.odd_duration_acknowledgements
	WHERE odd_duration_acknowledgements.appointment_employee_id IN (
		SELECT appointment_employees.id
		FROM public.appointment_employees
		WHERE appointment_employees.appointment_id = ANY (deleted_ids)
	);

	PERFORM set_config('app.deleting_appointments', 'off', true);

	-- The appointment goes before its crew rows (by cascade): the crew trigger then finds no
	-- appointment to re-derive, so no status update can join an Automatic draft or run the cancel
	-- path. Deleting the crew first would re-derive the dying visit's status.
	DELETE FROM public.appointments
	WHERE appointments.id = ANY (deleted_ids);

	-- An archived draft's lines were all released when it was archived, so it holds no live line
	-- and would be deleted whole, other visits' lines with it; it is left as it is.
	PERFORM private.invoice_delete_if_empty(invoices.id)
	FROM public.invoices
	WHERE invoices.id = ANY (touched_invoice_ids)
		AND NOT invoices.is_archived;

	-- Nothing left to charge: void it and release its lines, as the status trigger does when an
	-- issued invoice's last line is cancelled. An issued invoice carries no Payment to clear.
	WITH emptied AS (
		UPDATE public.invoices
		SET status = 'void'
		WHERE invoices.id = ANY (touched_invoice_ids)
			AND invoices.status = 'issued'
			AND NOT EXISTS (
				SELECT 1
				FROM public.invoice_appointments
				WHERE invoice_appointments.invoice_id = invoices.id
					AND NOT invoice_appointments.is_archived
					AND invoice_appointments.cancelled_at IS NULL
			)
		RETURNING invoices.id
	)
	UPDATE public.invoice_appointments
	SET is_archived = true
	WHERE invoice_appointments.invoice_id IN (SELECT emptied.id FROM emptied)
		AND NOT invoice_appointments.is_archived;

	-- A call that deleted nothing changes nothing, so the admin's "void the invoice first" holds.
	IF cardinality(deleted_ids) > 0 THEN
		IF p_series_change = 'end_before' THEN
			UPDATE public.recurrence_series
			SET end_date = least(coalesce(recurrence_series.end_date, p_end_before - 1), p_end_before - 1)
			WHERE recurrence_series.id = p_series_id;
		ELSIF p_series_change = 'delete' THEN
			DELETE FROM public.recurrence_series
			WHERE recurrence_series.id = p_series_id;
		END IF;
	END IF;

	RETURN jsonb_build_object(
		'deleted', to_jsonb(deleted_ids),
		'skipped', coalesce(
			(SELECT jsonb_agg(jsonb_build_object('id', skipped.id, 'reason', 'paid_invoice') ORDER BY skipped.id)
			FROM unnest(skipped_ids) AS skipped(id)),
			'[]'::jsonb),
		'invoice_ids', to_jsonb(touched_invoice_ids)
	);
END;
$$;

ALTER FUNCTION "public"."delete_appointments"("uuid"[], "uuid", "text", "date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_appointments"("uuid"[], "uuid", "text", "date") IS 'Admin only. Permanently deletes the named unarchived visits with their crew rows, clocks, Clock corrections, Odd duration acknowledgements and invoice lines, skipping any with a line on a paid invoice (paid_invoice). Deletes a draft left with no live line, voids an issued one, then applies the Series change (none, end_before, delete) when anything was deleted. Returns { deleted, skipped, invoice_ids }.';

GRANT ALL ON FUNCTION "public"."delete_appointments"("uuid"[], "uuid", "text", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_appointments"("uuid"[], "uuid", "text", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_appointments"("uuid"[], "uuid", "text", "date") TO "service_role";
