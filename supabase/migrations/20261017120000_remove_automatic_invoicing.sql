-- Automatic invoicing is removed: picking appointments by hand (and Mark paid) is the only way to bill.
--
-- Invoices update, ticket 02; CONTEXT.md "Automatic invoice", "Billable appointment",
-- "Unbilled appointment", "Archived invoice". Follows 20261011150000_manual_invoicing_only.
--
-- CONTRACT
--
--   * A leftover Automatic draft becomes an ordinary draft: is_automatic is cleared and nothing is
--     deleted, so it keeps all its lines.
--   * invoices_no_automatic_draft: a draft is never automatic. No function sets is_automatic on a
--     new invoice (invoice_create_draft and invoice_mark_paid already insert false). Issued, paid
--     and void invoices keep their flag: the "Automatic" badge stays on old history.
--   * appointments_invoicing keeps its client-move and cancel handling with identical behaviour
--     (the line leaves a draft, a Cancelled line on an issued invoice that voids when nothing is
--     left, the refusal on a paid one). Its completion branch (join an Automatic draft) and its
--     reopen branch (an Automatic draft lets go) are gone: completing or reopening a visit never
--     touches an invoice.
--   * private.invoice_join_automatic_draft and the one-Automatic-draft-per-client index are dropped.
--   * invoice_update_draft and invoice_archive no longer mark visits Excluded; invoice_unarchive
--     no longer decides whether a draft stays Automatic (a draft never is) or clears Excluded.
--   * clients.automatic_invoicing and appointments.excluded_from_automatic are dropped. Nothing
--     else depends on them (checked: no view, policy, index or constraint; the functions above
--     were the only readers).
--
-- DOWN. Not restorable: the Automatic flag cleared on leftover drafts, the Excluded flags and the
-- switch values aren't recorded. Re-run the CREATE FUNCTION blocks of 20261011140000
-- (invoice_update_draft), 20261009150000 (invoice_archive, invoice_unarchive) and 20261009140000
-- (appointments_invoicing, invoice_join_automatic_draft) with CREATE OR REPLACE, then:
--
--   ALTER TABLE "public"."invoices" DROP CONSTRAINT "invoices_no_automatic_draft";
--   ALTER TABLE "public"."clients" ADD COLUMN "automatic_invoicing" boolean NOT NULL DEFAULT false;
--   ALTER TABLE "public"."appointments" ADD COLUMN "excluded_from_automatic" boolean NOT NULL DEFAULT false;
--   CREATE UNIQUE INDEX "invoices_one_automatic_draft" ON "public"."invoices" ("client_id")
--       WHERE ("is_automatic" AND ("status" = 'draft'::"text") AND (NOT "is_archived"));


-- 1. Leftover Automatic drafts become ordinary drafts ---------------------------------------------

UPDATE "public"."invoices"
SET "is_automatic" = false
WHERE "is_automatic" AND "status" = 'draft';


-- 2. No draft is ever Automatic --------------------------------------------------------------------

DROP INDEX "public"."invoices_one_automatic_draft";

ALTER TABLE "public"."invoices"
    ADD CONSTRAINT "invoices_no_automatic_draft" CHECK ("status" <> 'draft' OR NOT "is_automatic");

COMMENT ON COLUMN "public"."invoices"."is_automatic" IS 'History only: the invoice was made by the retired Automatic invoicing. Never true on a draft or on a new invoice.';


-- 3. appointments_invoicing: cancel and client move stay, the join goes -----------------------------

CREATE OR REPLACE FUNCTION "private"."sync_invoicing_on_appointment_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	claim_invoice_id uuid;
	claim_invoice_status text;
BEGIN
	-- The visit's Live claim, if any. Its appointment row is already locked by the UPDATE that
	-- fired this trigger, so locking the invoice now keeps the appointment-then-invoice order.
	SELECT invoices.id, invoices.status
	INTO claim_invoice_id, claim_invoice_status
	FROM public.invoice_appointments
	JOIN public.invoices ON invoices.id = invoice_appointments.invoice_id
	WHERE invoice_appointments.appointment_id = NEW.id
		AND NOT invoice_appointments.is_archived
		AND invoice_appointments.cancelled_at IS NULL
	FOR UPDATE OF invoices;

	IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
		IF claim_invoice_status = 'paid' THEN
			PERFORM public.invoice_error('invoice_paid');
		ELSIF claim_invoice_status = 'issued' THEN
			PERFORM public.invoice_error('invoice_issued');
		ELSIF claim_invoice_status = 'draft' THEN
			DELETE FROM public.invoice_appointments
			WHERE invoice_appointments.invoice_id = claim_invoice_id
				AND invoice_appointments.appointment_id = NEW.id;
			PERFORM private.invoice_delete_if_empty(claim_invoice_id);
			claim_invoice_id := NULL;
			claim_invoice_status := NULL;
		END IF;
	END IF;

	IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelled' THEN
		IF claim_invoice_status = 'paid' THEN
			PERFORM public.invoice_error('invoice_paid');
		ELSIF claim_invoice_status = 'issued' THEN
			-- A Cancelled line charges nothing and no longer claims the visit.
			UPDATE public.invoice_appointments
			SET cancelled_at = now()
			WHERE invoice_appointments.invoice_id = claim_invoice_id
				AND invoice_appointments.appointment_id = NEW.id;

			IF NOT EXISTS (
				SELECT 1
				FROM public.invoice_appointments
				WHERE invoice_appointments.invoice_id = claim_invoice_id
					AND NOT invoice_appointments.is_archived
					AND invoice_appointments.cancelled_at IS NULL
			) THEN
				-- Nothing left to charge: void it and release its lines, as a manual void does. An
				-- issued invoice carries no Payment, so there is none to clear.
				UPDATE public.invoices
				SET status = 'void'
				WHERE invoices.id = claim_invoice_id;

				UPDATE public.invoice_appointments
				SET is_archived = true
				WHERE invoice_appointments.invoice_id = claim_invoice_id;
			END IF;
		ELSIF claim_invoice_status = 'draft' THEN
			DELETE FROM public.invoice_appointments
			WHERE invoice_appointments.invoice_id = claim_invoice_id
				AND invoice_appointments.appointment_id = NEW.id;
			PERFORM private.invoice_delete_if_empty(claim_invoice_id);
		END IF;
	END IF;

	RETURN NULL;
END;
$$;

DROP FUNCTION "private"."invoice_join_automatic_draft"("uuid", "uuid");


-- 4. invoice_update_draft: removing a line no longer marks it Excluded ----------------------------

CREATE OR REPLACE FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_write_details" boolean, "p_due_date" "date", "p_notes" "text") RETURNS "void"
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
BEGIN
	IF get_user_role() <> 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	-- Only the visits the admin named are touched, so they are the whole lock set: a line that
	-- joins the draft meanwhile is neither seen, removed nor written to.
	PERFORM private.invoice_lock_visits(added_ids || removed_ids);

	SELECT invoices.client_id, invoices.status, invoices.is_archived
	INTO draft_client_id, draft_status, is_draft_archived
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

	-- A removed id that isn't on this draft deletes nothing.
	DELETE FROM invoice_appointments
	WHERE invoice_appointments.invoice_id = p_invoice_id
		AND invoice_appointments.appointment_id = ANY (removed_ids);

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


-- 5. invoice_archive: archiving no longer marks visits Excluded -----------------------------------

CREATE OR REPLACE FUNCTION "public"."invoice_archive"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	locked_invoice public.invoices;
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	locked_invoice := private.lock_invoice_for_write(p_invoice_id, ARRAY['draft', 'paid', 'void']);

	IF locked_invoice.status = 'draft' THEN
		UPDATE invoice_appointments
		SET is_archived = true
		WHERE invoice_appointments.invoice_id = p_invoice_id
			AND NOT invoice_appointments.is_archived;
	END IF;

	UPDATE invoices SET is_archived = true WHERE invoices.id = p_invoice_id;
END;
$$;


-- 6. invoice_unarchive: a draft is never Automatic, so there is no flag to keep or Excluded to clear

CREATE OR REPLACE FUNCTION "public"."invoice_unarchive"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	locked_invoice public.invoices;
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	locked_invoice := private.lock_invoice(p_invoice_id);

	IF NOT locked_invoice.is_archived THEN
		PERFORM invoice_error('invalid_status');
	END IF;

	-- Archiving released the lines, so the visits may have changed since; they are locked now.
	IF locked_invoice.status = 'draft' THEN
		IF EXISTS (
			SELECT 1
			FROM invoice_appointments own_line
			JOIN appointments ON appointments.id = own_line.appointment_id
			WHERE own_line.invoice_id = p_invoice_id
				AND own_line.cancelled_at IS NULL
				AND appointments.status = 'cancelled'
		) THEN
			PERFORM invoice_error('visit_cancelled');
		END IF;

		IF EXISTS (
			SELECT 1
			FROM invoice_appointments own_line
			JOIN appointments ON appointments.id = own_line.appointment_id
			WHERE own_line.invoice_id = p_invoice_id
				AND own_line.cancelled_at IS NULL
				AND appointments.client_id IS DISTINCT FROM locked_invoice.client_id
		) THEN
			PERFORM invoice_error('visit_other_client');
		END IF;

		IF EXISTS (
			SELECT 1
			FROM invoice_appointments own_line
			JOIN invoice_appointments other_line
				ON other_line.appointment_id = own_line.appointment_id
				AND other_line.invoice_id <> own_line.invoice_id
				AND NOT other_line.is_archived
				AND other_line.cancelled_at IS NULL
			WHERE own_line.invoice_id = p_invoice_id
				AND own_line.cancelled_at IS NULL
		) THEN
			PERFORM invoice_error('visit_claimed');
		END IF;

		-- The live-claim index still guards a claim made by a writer that didn't lock the visit.
		BEGIN
			UPDATE invoice_appointments
			SET is_archived = false
			WHERE invoice_appointments.invoice_id = p_invoice_id
				AND invoice_appointments.cancelled_at IS NULL;
		EXCEPTION WHEN unique_violation THEN
			PERFORM invoice_error('visit_claimed');
		END;
	END IF;

	UPDATE invoices
	SET is_archived = false
	WHERE invoices.id = p_invoice_id;
END;
$$;


-- 7. Catalog comments: no more Automatic or Excluded wording -----------------------------------------

COMMENT ON FUNCTION "private"."sync_invoicing_on_appointment_update"() IS 'AFTER UPDATE trigger on appointments: on a client move or a cancel, updates the visit''s invoice line (see 20261009140000 CONTRACT). A completion or a reopen never touches an invoice. Definer rights so it works whichever role changed the status.';

COMMENT ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_write_details" boolean, "p_due_date" "date", "p_notes" "text") IS 'Admin only. Adds and removes the named visits on a draft; lines it isn''t told about stay. Sets the due date and notes only when p_write_details is true (a null then clears them); otherwise they stay as stored. A draft left with no live line is deleted. Refuses invoice_not_found, archived_invoice, invalid_status, then the visit codes of invoice_create_draft for added visits.';

COMMENT ON FUNCTION "public"."invoice_archive"("p_invoice_id" "uuid") IS 'Archives a draft, paid or void invoice. A draft releases its lines.';

COMMENT ON FUNCTION "public"."invoice_unarchive"("p_invoice_id" "uuid") IS 'Unarchives an invoice. A draft re-claims its lines (refused while a visit has a Live claim elsewhere).';


-- 8. The columns ------------------------------------------------------------------------------------

ALTER TABLE "public"."clients" DROP COLUMN "automatic_invoicing";

ALTER TABLE "public"."appointments" DROP COLUMN "excluded_from_automatic";
