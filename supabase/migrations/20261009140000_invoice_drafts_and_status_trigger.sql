-- The draft write path and the trigger that keeps billing in step with appointment status.
--
-- ADR docs/adr/0001-invoice-writes-in-sql-functions-and-status-trigger.md; decisions #51 (cancel
-- and client move on drafts), #53 (trigger rules, Excluded, reopen), #54 (Automatic invoicing),
-- #63 (error contract); CONTEXT.md "Automatic draft", "Excluded visit", "Cancelled line", "Live
-- claim", "Upcoming line". Schema, business_date() and invoice_error() come from 20261009130000.
--
-- CONTRACT
--
--   * invoice_create_draft(client, appointment_ids, due_date, notes) -> the new draft's id. A
--     manual draft (is_automatic = false) with one priceless line per distinct visit. Refuses, in
--     this order: not_admin, empty_lines (null or empty list), visit_other_client (unknown client,
--     or an unknown, archived or another client's visit), visit_cancelled, visit_claimed (the
--     visit already has a Live claim). Any other status is allowed, so Upcoming lines are fine.
--   * invoice_update_draft(invoice, add_appointment_ids, remove_appointment_ids, due_date, notes).
--     Refuses not_admin, invoice_not_found, archived_invoice, invalid_status (anything but a
--     draft), then validates the visits it adds as create does. It applies the difference the
--     admin made (Franklin, 2026-10-09): only the named visits are added or removed, so a visit
--     that joined the draft after the page loaded stays. A visit in both lists is removed; adding
--     a line the draft holds, or removing one it doesn't, does nothing. A line removed from an
--     Automatic draft makes its visit Excluded. A draft left with no lines is deleted and the call
--     still succeeds. due_date and notes are overwritten.
--   * Trigger appointments_stamp_completed_at (BEFORE UPDATE): sets completed_at = now() when the
--     final status becomes completed. It sorts after appointments_derive_status, so it sees the
--     derived status, and it rides on the same row write.
--   * Trigger appointments_invoicing (AFTER UPDATE OF status, client_id, manually_completed): acts
--     only when client_id or status actually changed. manually_completed is in the column list
--     because Mark complete writes only the flag and lets a BEFORE trigger move status, which a
--     column list on status alone would not see.
--       client_id changed      -> the visit's draft line is deleted (empty draft deleted); a line
--                                 on an issued invoice raises invoice_issued, on a paid one
--                                 invoice_paid. The visit does not join the new client's draft.
--       -> cancelled           -> draft line deleted (empty draft deleted, Excluded untouched);
--                                 an issued line gets cancelled_at, and an issued invoice left
--                                 with no uncancelled line becomes void with its lines released;
--                                 a paid line raises invoice_paid, which aborts the cancel.
--       -> completed           -> (also Restore into completed) joins the client's Automatic
--                                 draft, creating it, when the client has Automatic invoicing,
--                                 the visit is not Excluded or archived, and it has no Live claim.
--                                 An old Cancelled line is left as it is.
--       completed -> other     -> the line leaves the client's Automatic draft only (manual drafts
--                                 keep Upcoming lines); an emptied Automatic draft is deleted.
--
-- Every function checks get_user_role() itself (revoking EXECUTE crashes the Supabase image, see
-- 20260917120000), raises refusals only through invoice_error, and does all its writes in the
-- caller's transaction. Lock order is appointment rows (FOR UPDATE, by id), then the invoice row,
-- the same order the trigger takes: its appointment row is already locked by the UPDATE that
-- fired it.
--
-- The private.invoice_* helpers are internal to this migration's functions; ticket 06's
-- functions may reuse them.
--
-- DOWN. Drops only what this file creates; no column or row from earlier migrations changes.
--
--   DROP TRIGGER "appointments_invoicing" ON "public"."appointments";
--   DROP TRIGGER "appointments_stamp_completed_at" ON "public"."appointments";
--   DROP FUNCTION "private"."sync_invoicing_on_appointment_update"();
--   DROP FUNCTION "private"."stamp_appointment_completed_at"();
--   DROP FUNCTION "public"."invoice_update_draft"("uuid", "uuid"[], "uuid"[], "date", "text");
--   DROP FUNCTION "public"."invoice_create_draft"("uuid", "uuid"[], "date", "text");
--   DROP FUNCTION "private"."invoice_join_automatic_draft"("uuid", "uuid");
--   DROP FUNCTION "private"."invoice_add_lines"("uuid", "uuid", "uuid"[]);
--   DROP FUNCTION "private"."invoice_lock_visits"("uuid"[]);
--   DROP FUNCTION "private"."invoice_delete_if_empty"("uuid");


-- 1. Helpers -------------------------------------------------------------------------------------

CREATE FUNCTION "private"."invoice_lock_visits"("appointment_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	-- Ordered by id so two writers over overlapping visits always queue in the same order.
	PERFORM appointments.id
	FROM public.appointments
	WHERE appointments.id = ANY (invoice_lock_visits.appointment_ids)
	ORDER BY appointments.id
	FOR UPDATE;
END;
$$;

ALTER FUNCTION "private"."invoice_lock_visits"("appointment_ids" "uuid"[]) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."invoice_lock_visits"("appointment_ids" "uuid"[]) FROM PUBLIC;

COMMENT ON FUNCTION "private"."invoice_lock_visits"("appointment_ids" "uuid"[]) IS 'Locks the given appointment rows FOR UPDATE in id order: the first step of every invoice write that touches visits, before the invoice row is locked.';


CREATE FUNCTION "private"."invoice_add_lines"("invoice_id" "uuid", "client_id" "uuid", "appointment_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	-- An unknown id reads as another client's visit: either way it can't go on this invoice.
	IF EXISTS (
		SELECT 1
		FROM unnest(invoice_add_lines.appointment_ids) AS requested(appointment_id)
		LEFT JOIN public.appointments ON appointments.id = requested.appointment_id
		WHERE appointments.id IS NULL
			OR appointments.client_id <> invoice_add_lines.client_id
			OR coalesce(appointments.is_archived, false)
	) THEN
		PERFORM public.invoice_error('visit_other_client');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.appointments
		WHERE appointments.id = ANY (invoice_add_lines.appointment_ids)
			AND appointments.status = 'cancelled'
	) THEN
		PERFORM public.invoice_error('visit_cancelled');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.invoice_appointments
		WHERE invoice_appointments.appointment_id = ANY (invoice_add_lines.appointment_ids)
			AND NOT invoice_appointments.is_archived
			AND invoice_appointments.cancelled_at IS NULL
	) THEN
		PERFORM public.invoice_error('visit_claimed');
	END IF;

	INSERT INTO public.invoice_appointments (invoice_id, appointment_id)
	SELECT DISTINCT invoice_add_lines.invoice_id, requested.appointment_id
	FROM unnest(invoice_add_lines.appointment_ids) AS requested(appointment_id);
END;
$$;

ALTER FUNCTION "private"."invoice_add_lines"("invoice_id" "uuid", "client_id" "uuid", "appointment_ids" "uuid"[]) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."invoice_add_lines"("invoice_id" "uuid", "client_id" "uuid", "appointment_ids" "uuid"[]) FROM PUBLIC;

COMMENT ON FUNCTION "private"."invoice_add_lines"("invoice_id" "uuid", "client_id" "uuid", "appointment_ids" "uuid"[]) IS 'Adds one priceless line per distinct visit to a draft, refusing visit_other_client (unknown, archived or another client''s), visit_cancelled and visit_claimed, in that order. The caller has locked the visits.';


CREATE FUNCTION "private"."invoice_delete_if_empty"("invoice_id" "uuid") RETURNS "void"
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
		);
$$;

ALTER FUNCTION "private"."invoice_delete_if_empty"("invoice_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."invoice_delete_if_empty"("invoice_id" "uuid") FROM PUBLIC;

COMMENT ON FUNCTION "private"."invoice_delete_if_empty"("invoice_id" "uuid") IS 'Deletes a draft that has no lines left. Never touches an issued, paid or void invoice.';


-- 2. invoice_create_draft ------------------------------------------------------------------------

CREATE FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	new_invoice_id uuid;
BEGIN
	IF get_user_role() <> 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	IF coalesce(cardinality(p_appointment_ids), 0) = 0 THEN
		PERFORM invoice_error('empty_lines');
	END IF;

	PERFORM private.invoice_lock_visits(p_appointment_ids);

	-- Checked before the insert so an unknown client is a refusal, not a foreign-key error.
	IF NOT EXISTS (SELECT 1 FROM clients WHERE clients.id = p_client_id) THEN
		PERFORM invoice_error('visit_other_client');
	END IF;

	INSERT INTO invoices (client_id, status, is_automatic, due_date, notes)
	VALUES (p_client_id, 'draft', false, p_due_date, p_notes)
	RETURNING id INTO new_invoice_id;

	PERFORM private.invoice_add_lines(new_invoice_id, p_client_id, p_appointment_ids);

	RETURN new_invoice_id;
END;
$$;

ALTER FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") IS 'Admin only. Creates a manual draft for the client with one priceless line per visit. Refuses empty_lines, visit_other_client, visit_cancelled, visit_claimed. Returns the draft''s id.';

GRANT ALL ON FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") TO "service_role";


-- 3. invoice_update_draft ------------------------------------------------------------------------

CREATE FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") RETURNS "void"
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

	UPDATE invoices
	SET due_date = p_due_date, notes = p_notes
	WHERE invoices.id = p_invoice_id;

	PERFORM private.invoice_delete_if_empty(p_invoice_id);
END;
$$;

ALTER FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") IS 'Admin only. Adds and removes the named visits on a draft and sets its due date and notes; lines it isn''t told about stay. A line removed from an Automatic draft makes its visit Excluded; a draft left with no lines is deleted. Refuses invoice_not_found, archived_invoice, invalid_status, then the visit codes of invoice_create_draft for added visits.';

GRANT ALL ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_update_draft"("p_invoice_id" "uuid", "p_add_appointment_ids" "uuid"[], "p_remove_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text") TO "service_role";


-- 4. Trigger: stamp completed_at -----------------------------------------------------------------

CREATE FUNCTION "private"."stamp_appointment_completed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
		NEW.completed_at := now();
	END IF;

	RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."stamp_appointment_completed_at"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."stamp_appointment_completed_at"() IS 'BEFORE UPDATE trigger on appointments: stamps completed_at when the status becomes completed. Runs after appointments_derive_status (trigger names sort), so it sees the derived status.';

-- No column list: a BEFORE trigger's own status change (Mark complete, Restore) must count too.
CREATE TRIGGER "appointments_stamp_completed_at"
    BEFORE UPDATE ON "public"."appointments"
    FOR EACH ROW EXECUTE FUNCTION "private"."stamp_appointment_completed_at"();


-- 5. Trigger: keep billing in step with status ---------------------------------------------------

CREATE FUNCTION "private"."invoice_join_automatic_draft"("visit_id" "uuid", "draft_client_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	draft_id uuid;
BEGIN
	-- Two first completions racing: the loser's insert waits on the winner's draft and does
	-- nothing, then finds and locks it. It loops only if that draft was issued in between.
	LOOP
		INSERT INTO public.invoices (client_id, status, is_automatic)
		VALUES (invoice_join_automatic_draft.draft_client_id, 'draft', true)
		ON CONFLICT (client_id) WHERE (is_automatic AND status = 'draft' AND NOT is_archived) DO NOTHING
		RETURNING invoices.id INTO draft_id;

		IF draft_id IS NULL THEN
			SELECT invoices.id
			INTO draft_id
			FROM public.invoices
			WHERE invoices.client_id = invoice_join_automatic_draft.draft_client_id
				AND invoices.is_automatic
				AND invoices.status = 'draft'
				AND NOT invoices.is_archived
			FOR UPDATE;
		END IF;

		EXIT WHEN draft_id IS NOT NULL;
	END LOOP;

	INSERT INTO public.invoice_appointments (invoice_id, appointment_id)
	VALUES (draft_id, invoice_join_automatic_draft.visit_id);
END;
$$;

ALTER FUNCTION "private"."invoice_join_automatic_draft"("visit_id" "uuid", "draft_client_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."invoice_join_automatic_draft"("visit_id" "uuid", "draft_client_id" "uuid") FROM PUBLIC;

COMMENT ON FUNCTION "private"."invoice_join_automatic_draft"("visit_id" "uuid", "draft_client_id" "uuid") IS 'Adds a priceless line for the visit to the client''s Automatic draft, creating the draft when there is none. Safe against concurrent first completions through the invoices_one_automatic_draft index.';


CREATE FUNCTION "private"."sync_invoicing_on_appointment_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	claim_invoice_id uuid;
	claim_invoice_status text;
	is_claim_automatic boolean;
	is_client_automatic boolean;
BEGIN
	-- The visit's Live claim, if any. Its appointment row is already locked by the UPDATE that
	-- fired this trigger, so locking the invoice now keeps the appointment-then-invoice order.
	SELECT invoices.id, invoices.status, invoices.is_automatic
	INTO claim_invoice_id, claim_invoice_status, is_claim_automatic
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

	IF NEW.status IS DISTINCT FROM OLD.status THEN
		IF NEW.status = 'cancelled' THEN
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
				-- Excluded is left alone: cancelling is not a decision about automatic billing.
				DELETE FROM public.invoice_appointments
				WHERE invoice_appointments.invoice_id = claim_invoice_id
					AND invoice_appointments.appointment_id = NEW.id;
				PERFORM private.invoice_delete_if_empty(claim_invoice_id);
			END IF;
		ELSIF NEW.status = 'completed' THEN
			SELECT clients.automatic_invoicing
			INTO is_client_automatic
			FROM public.clients
			WHERE clients.id = NEW.client_id;

			IF is_client_automatic
				AND NOT NEW.excluded_from_automatic
				AND NOT coalesce(NEW.is_archived, false)
				AND claim_invoice_id IS NULL THEN
				PERFORM private.invoice_join_automatic_draft(NEW.id, NEW.client_id);
			END IF;
		ELSIF OLD.status = 'completed' THEN
			-- Reopened: only the Automatic draft lets go; a manual draft keeps it as an Upcoming line.
			IF claim_invoice_status = 'draft' AND is_claim_automatic THEN
				DELETE FROM public.invoice_appointments
				WHERE invoice_appointments.invoice_id = claim_invoice_id
					AND invoice_appointments.appointment_id = NEW.id;
				PERFORM private.invoice_delete_if_empty(claim_invoice_id);
			END IF;
		END IF;
	END IF;

	RETURN NULL;
END;
$$;

ALTER FUNCTION "private"."sync_invoicing_on_appointment_update"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."sync_invoicing_on_appointment_update"() IS 'AFTER UPDATE trigger on appointments: on a client move, a cancel, a completion or a reopen, updates the visit''s invoice line (see 20261009140000 CONTRACT). Definer rights so it works whichever role changed the status.';

-- manually_completed is listed because Mark complete moves status only through a BEFORE trigger.
CREATE TRIGGER "appointments_invoicing"
    AFTER UPDATE OF "status", "client_id", "manually_completed" ON "public"."appointments"
    FOR EACH ROW EXECUTE FUNCTION "private"."sync_invoicing_on_appointment_update"();
