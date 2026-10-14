-- Every invoice gets one admin-only Internal note (CONTEXT.md "Internal note").
--
--   * invoices.internal_note: free text, NULL when there is none. Never shown or printed for the
--     client, unlike notes. Existing rows read NULL. invoices_with_status lists its columns by
--     name, so it doesn't gain this one; the list pages don't show the note.
--   * invoice_set_internal_note(invoice, note) is its one write path (ADR docs/adr/0001). Admin
--     only, at any status and while archived: the note is the one thing an archived invoice still
--     lets an admin change, so there is no invalid_status or archived_invoice refusal. It stores
--     the note trimmed, and blank (or null) clears it. Last save wins; nothing else is touched.
--
-- anon keeps EXECUTE through GRANT ALL as on the other invoice functions: revoking EXECUTE
-- crashes the Supabase image (see 20260917120000), so the function's own get_user_role() check
-- is the gate (ADR 0001 consequences).
--
-- DOWN. Destructive for the notes it drops. Run in this order:
--   DROP FUNCTION "public"."invoice_set_internal_note"("uuid", "text");
--   ALTER TABLE "public"."invoices" DROP COLUMN "internal_note";


-- 1. invoices.internal_note ----------------------------------------------------------------------

ALTER TABLE "public"."invoices" ADD COLUMN "internal_note" "text";

COMMENT ON COLUMN "public"."invoices"."internal_note" IS 'Admin-only note, never shown or printed for the client (not notes, which the client sees). NULL when empty. Written only by invoice_set_internal_note.';


-- 2. invoice_set_internal_note -------------------------------------------------------------------

CREATE FUNCTION "public"."invoice_set_internal_note"("p_invoice_id" "uuid", "p_internal_note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
	IF get_user_role() <> 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	-- Locked like every other invoice write, so a save never interleaves with a transition.
	PERFORM 1
	FROM invoices
	WHERE invoices.id = p_invoice_id
	FOR UPDATE;

	IF NOT FOUND THEN
		PERFORM invoice_error('invoice_not_found');
	END IF;

	-- btrim's default trims spaces only; a note of line breaks is blank too.
	UPDATE invoices
	SET internal_note = nullif(btrim(p_internal_note, E' \t\r\n'), '')
	WHERE invoices.id = p_invoice_id;
END;
$$;

ALTER FUNCTION "public"."invoice_set_internal_note"("p_invoice_id" "uuid", "p_internal_note" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_set_internal_note"("p_invoice_id" "uuid", "p_internal_note" "text") IS 'Admin only. Sets the invoice''s Internal note, trimmed; blank or null clears it. Allowed at any status and while archived. Touches no other column. Refuses not_admin, then invoice_not_found.';

GRANT ALL ON FUNCTION "public"."invoice_set_internal_note"("p_invoice_id" "uuid", "p_internal_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_set_internal_note"("p_invoice_id" "uuid", "p_internal_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_set_internal_note"("p_invoice_id" "uuid", "p_internal_note" "text") TO "service_role";
