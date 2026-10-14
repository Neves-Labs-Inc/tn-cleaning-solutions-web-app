-- The Create invoice form can set the new draft's Internal note (CONTEXT.md "Internal note").
--
--   * invoice_create_draft gains a trailing p_internal_note and stores it on the inserted draft,
--     in the same transaction, by the rule of invoice_set_internal_note (20261014200500): trimmed,
--     and blank (or null) stored as NULL. Everything else is as in 20261009140000: the not_admin
--     check, the refusals, the lock order (visits by id, then the client check) and the lines.
--   * invoices.internal_note's comment now names both write paths.
--
-- invoice_create_draft is dropped and recreated (the signature changes). anon keeps EXECUTE
-- through GRANT ALL as in 20261009140000: revoking EXECUTE crashes the Supabase image (see
-- 20260917120000), so the function's own get_user_role() check is the gate.
--
-- DOWN. No data changes; notes already stored stay. Run
--   DROP FUNCTION "public"."invoice_create_draft"("uuid", "uuid"[], "date", "text", "text");
-- then recreate invoice_create_draft from 20261009140000 (section 2) with its OWNER, COMMENT and
-- three GRANTs, and restore the column comment from 20261014200500.


-- 1. invoice_create_draft ------------------------------------------------------------------------

DROP FUNCTION "public"."invoice_create_draft"("uuid", "uuid"[], "date", "text");

CREATE FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text", "p_internal_note" "text") RETURNS "uuid"
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

	-- btrim's default trims spaces only; a note of line breaks is blank too.
	INSERT INTO invoices (client_id, status, is_automatic, due_date, notes, internal_note)
	VALUES (p_client_id, 'draft', false, p_due_date, p_notes, nullif(btrim(p_internal_note, E' \t\r\n'), ''))
	RETURNING id INTO new_invoice_id;

	PERFORM private.invoice_add_lines(new_invoice_id, p_client_id, p_appointment_ids);

	RETURN new_invoice_id;
END;
$$;

ALTER FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text", "p_internal_note" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text", "p_internal_note" "text") IS 'Admin only. Creates a manual draft for the client with one priceless line per visit, and its Internal note trimmed (blank or null stores NULL). Refuses empty_lines, visit_other_client, visit_cancelled, visit_claimed. Returns the draft''s id.';

GRANT ALL ON FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text", "p_internal_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text", "p_internal_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_create_draft"("p_client_id" "uuid", "p_appointment_ids" "uuid"[], "p_due_date" "date", "p_notes" "text", "p_internal_note" "text") TO "service_role";


-- 2. invoices.internal_note ----------------------------------------------------------------------

COMMENT ON COLUMN "public"."invoices"."internal_note" IS 'Admin-only note, never shown or printed for the client (not notes, which the client sees). NULL when empty. Written only by invoice_set_internal_note and, on a new draft, invoice_create_draft.';
