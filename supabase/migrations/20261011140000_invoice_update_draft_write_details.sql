-- Draft line edits keep the stored due date and notes; only live lines keep a draft.
--
-- Amends the draft write path of 20261009140000 (ADR docs/adr/0001; CONTEXT.md "Live claim",
-- "Cancelled line").
--
--   * invoice_update_draft gains p_write_details. Removing a line or adding visits used to send
--     the page's saved due date and notes, so a stale page overwrote notes edited elsewhere. Line
--     changes now pass false and the stored values stay; only the details form's Save passes true,
--     and then due_date and notes are overwritten (a null due date clears it). Everything else is
--     as before: the refusals, the difference-only line edits, Excluded on removal from an
--     Automatic draft, and the lock order (named visits by id, then the invoice row).
--   * private.invoice_delete_if_empty deletes a draft with no live line (not archived and not
--     cancelled), matching the UI's "This is its only appointment. Removing it deletes the
--     draft." A draft holding only Cancelled or released lines charges nothing and claims
--     nothing, so it is as empty as one with no rows. Its lines go with it (ON DELETE CASCADE).
--     Issued, paid and void invoices are still never deleted. The trigger's callers get the same
--     rule.
--
-- invoice_update_draft is dropped and recreated (the signature changes). anon keeps EXECUTE
-- through GRANT ALL as in 20261009140000: revoking EXECUTE crashes the Supabase image (see
-- 20260917120000), so the function's own get_user_role() check is the gate.
--
-- DOWN. Recreate both functions from 20261009140000 (sections 1 and 3), after
--   DROP FUNCTION "public"."invoice_update_draft"("uuid", "uuid"[], "uuid"[], boolean, "date", "text");
-- and restore that file's three GRANTs on the five-argument invoice_update_draft. No data changes.


-- 1. invoice_delete_if_empty ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."invoice_delete_if_empty"("invoice_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
	DELETE FROM public.invoices
	WHERE invoices.id = invoice_delete_if_empty.invoice_id
		AND invoices.status = 'draft'
		AND NOT EXISTS (
			SELECT 1
			FROM public.invoice_appointments
			WHERE invoice_appointments.invoice_id = invoice_delete_if_empty.invoice_id
				AND NOT invoice_appointments.is_archived
				AND invoice_appointments.cancelled_at IS NULL
		);
$$;

COMMENT ON FUNCTION "private"."invoice_delete_if_empty"("invoice_id" "uuid") IS 'Deletes a draft that has no live line left (every line archived or cancelled, or none at all). Never touches an issued, paid or void invoice.';


-- 2. invoice_update_draft ------------------------------------------------------------------------

DROP FUNCTION "public"."invoice_update_draft"("uuid", "uuid"[], "uuid"[], "date", "text");

CREATE FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_write_details" boolean, "p_due_date" "date", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	removed_ids uuid[] := coalesce(p_remove_appointment_ids, '{}');
	-- A visit in both lists is removed: the admin's last word on it is ambiguous, and keeping it
	-- off the invoice is the safe reading.
	added_ids uuid[] := array(
		SELECT unnest(coalesce(p_add_appointment_ids, '{}'))
		EXCEPT
		SELECT unnest(removed_ids)
	);
	draft_client_id uuid;
	draft_status text;
	is_draft_archived boolean;
	is_draft_automatic boolean;
BEGIN
	IF get_user_role() <> 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	-- Only the visits the admin named are touched, so they are the whole lock set: a line that
	-- joins the draft meanwhile (a completion) is neither seen, removed nor written to.
	PERFORM private.invoice_lock_visits(added_ids || removed_ids);

	SELECT invoices.client_id, invoices.status, invoices.is_archived, invoices.is_automatic
	INTO draft_client_id, draft_status, is_draft_archived, is_draft_automatic
	FROM invoices
	WHERE invoices.id = p_invoice_id
	FOR UPDATE;

	IF NOT FOUND THEN
		PERFORM invoice_error('invoice_not_found');
	END IF;

	IF is_draft_archived THEN
		PERFORM invoice_error('archived_invoice');
	END IF;

	IF draft_status <> 'draft' THEN
		PERFORM invoice_error('invalid_status');
	END IF;

	-- An admin who takes a visit off an Automatic draft has decided not to bill it automatically.
	-- A removed id that isn't on this draft deletes nothing and is not Excluded.
	WITH removed AS (
		DELETE FROM invoice_appointments
		WHERE invoice_appointments.invoice_id = p_invoice_id
			AND invoice_appointments.appointment_id = ANY (removed_ids)
		RETURNING invoice_appointments.appointment_id
	)
	UPDATE appointments
	SET excluded_from_automatic = true
	WHERE is_draft_automatic
		AND appointments.id IN (SELECT removed.appointment_id FROM removed);

	-- Re-adding a visit already on this draft is a no-op, not a visit_claimed refusal.
	PERFORM private.invoice_add_lines(p_invoice_id, draft_client_id, array(
		SELECT unnest(added_ids)
		EXCEPT
		SELECT invoice_appointments.appointment_id
		FROM invoice_appointments
		WHERE invoice_appointments.invoice_id = p_invoice_id
	));

	-- A line change comes from a page whose details may be stale; only Save writes them.
	IF p_write_details THEN
		UPDATE invoices
		SET due_date = p_due_date, notes = p_notes
		WHERE invoices.id = p_invoice_id;
	END IF;

	PERFORM private.invoice_delete_if_empty(p_invoice_id);
END;
$$;

ALTER FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_write_details" boolean, "p_due_date" "date", "p_notes" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_write_details" boolean, "p_due_date" "date", "p_notes" "text") IS 'Admin only. Adds and removes the named visits on a draft; lines it isn''t told about stay. Sets the due date and notes only when p_write_details is true (a null then clears them); otherwise they stay as stored. A line removed from an Automatic draft makes its visit Excluded; a draft left with no live line is deleted. Refuses invoice_not_found, archived_invoice, invalid_status, then the visit codes of invoice_create_draft for added visits.';

GRANT ALL ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_write_details" boolean, "p_due_date" "date", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_write_details" boolean, "p_due_date" "date", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_write_details" boolean, "p_due_date" "date", "p_notes" "text") TO "service_role";
