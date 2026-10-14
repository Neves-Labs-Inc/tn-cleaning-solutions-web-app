-- Mark paid takes the new invoice's Internal note (CONTEXT.md "Internal note", "Mark paid").
--
--   invoice_mark_paid(client, lines jsonb, paid_date, method, reference, internal_note) -> jsonb
--
--   * Same as 20261011160000 (section 3) except the trailing p_internal_note, stored on the new
--     invoice in the same insert, trimmed the way invoice_set_internal_note (20261014200500) trims
--     it; blank or null is stored as NULL. Every refusal, its order and the lock order are
--     unchanged. The 2000-character cap is the server action's, as for invoice_set_internal_note.
--   * Dropped and recreated rather than overloaded, so there is one Mark paid signature to call.
--
-- anon keeps EXECUTE through GRANT ALL like the other invoice functions (revoking it crashes the
-- Supabase image, see 20260917120000); the function refuses not_admin itself.
--
-- DOWN. Run, then recreate invoice_mark_paid from 20261011160000 (section 3, with its OWNER,
-- COMMENT and GRANTs):
--
--   DROP FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text", "text");
--
-- No data changes; notes already stored on invoices stay.


DROP FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text");

CREATE FUNCTION "public"."invoice_mark_paid"("p_client_id" "uuid", "p_lines" "jsonb", "p_paid_date" "date", "p_method" "text", "p_reference" "text", "p_internal_note" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	issued_on date := business_date();
	paid_on date := coalesce(p_paid_date, business_date());
	lines jsonb := CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END;
	appointment_ids uuid[];
	emptied_draft_ids uuid[];
	method_name text;
	new_invoice_id uuid;
	new_number text;
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	IF jsonb_array_length(lines) = 0 THEN
		PERFORM invoice_error('empty_lines');
	END IF;

	-- A malformed appointment_id reads as null, which matches no appointment: visit_other_client.
	SELECT array_agg(DISTINCT private.invoice_line_uuid(line -> 'appointment_id'))
	INTO appointment_ids
	FROM jsonb_array_elements(lines) line;

	PERFORM private.invoice_lock_visits(array_remove(appointment_ids, NULL));

	-- The drafts that will lose a line, after the visits: the lock order of every invoice write.
	PERFORM invoices.id
	FROM invoices
	WHERE invoices.status = 'draft'
		AND invoices.id IN (
			SELECT invoice_appointments.invoice_id
			FROM invoice_appointments
			WHERE invoice_appointments.appointment_id = ANY (appointment_ids)
				AND NOT invoice_appointments.is_archived
				AND invoice_appointments.cancelled_at IS NULL
		)
	ORDER BY invoices.id
	FOR UPDATE;

	IF NOT EXISTS (SELECT 1 FROM clients WHERE clients.id = p_client_id)
		OR EXISTS (
			SELECT 1
			FROM unnest(appointment_ids) AS requested(appointment_id)
			LEFT JOIN appointments ON appointments.id = requested.appointment_id
			WHERE appointments.id IS NULL
				OR appointments.client_id <> p_client_id
				OR appointments.is_archived
		)
	THEN
		PERFORM invoice_error('visit_other_client');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM appointments
		WHERE appointments.id = ANY (appointment_ids)
			AND appointments.status = 'cancelled'
	) THEN
		PERFORM invoice_error('visit_cancelled');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM invoice_appointments
		JOIN invoices ON invoices.id = invoice_appointments.invoice_id
		WHERE invoice_appointments.appointment_id = ANY (appointment_ids)
			AND NOT invoice_appointments.is_archived
			AND invoice_appointments.cancelled_at IS NULL
			AND invoices.status = 'paid'
	) THEN
		PERFORM invoice_error('invoice_paid');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM invoice_appointments
		JOIN invoices ON invoices.id = invoice_appointments.invoice_id
		WHERE invoice_appointments.appointment_id = ANY (appointment_ids)
			AND NOT invoice_appointments.is_archived
			AND invoice_appointments.cancelled_at IS NULL
			AND invoices.status = 'issued'
	) THEN
		PERFORM invoice_error('invoice_issued');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(lines) line
		WHERE NOT private.is_invoice_count(line -> 'billed_amount_cents')
	) THEN
		PERFORM invoice_error('unpriced_line');
	END IF;

	IF paid_on > issued_on THEN
		PERFORM invoice_error('paid_date_future');
	END IF;

	method_name := private.invoice_payment_method(p_method);

	-- Only the marked appointments leave their drafts; Excluded stays as it is.
	WITH removed AS (
		DELETE FROM invoice_appointments
		USING invoices
		WHERE invoices.id = invoice_appointments.invoice_id
			AND invoices.status = 'draft'
			AND invoice_appointments.appointment_id = ANY (appointment_ids)
			AND NOT invoice_appointments.is_archived
			AND invoice_appointments.cancelled_at IS NULL
		RETURNING invoice_appointments.invoice_id
	)
	SELECT array_agg(DISTINCT removed.invoice_id) INTO emptied_draft_ids FROM removed;

	PERFORM private.invoice_delete_if_empty(draft_id)
	FROM unnest(coalesce(emptied_draft_ids, '{}')) AS draft_id;

	new_number := private.next_invoice_number(p_client_id, issued_on);

	-- btrim's default trims spaces only; a note of line breaks is blank too.
	INSERT INTO invoices (client_id, status, is_automatic, invoice_number, issued_date, due_date,
		paid_date, payment_method, payment_reference, internal_note)
	VALUES (p_client_id, 'paid', false, new_number, issued_on, NULL,
		paid_on, method_name, nullif(regexp_replace(p_reference, '^\s+|\s+$', '', 'g'), ''),
		nullif(btrim(p_internal_note, E' \t\r\n'), ''))
	RETURNING id INTO new_invoice_id;

	-- A repeated appointment keeps the amount of its first line.
	INSERT INTO invoice_appointments (invoice_id, appointment_id, billed_amount_cents)
	SELECT DISTINCT ON (passed.appointment_id) new_invoice_id, passed.appointment_id, passed.amount_cents
	FROM (
		SELECT private.invoice_line_uuid(line -> 'appointment_id') AS appointment_id,
			(line ->> 'billed_amount_cents')::numeric::integer AS amount_cents,
			position
		FROM jsonb_array_elements(lines) WITH ORDINALITY AS passed_line(line, position)
	) passed
	ORDER BY passed.appointment_id, passed.position;

	RETURN jsonb_build_object('invoice_id', new_invoice_id, 'invoice_number', new_number);
END;
$$;

ALTER FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text", "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text", "text") IS 'Mark paid: bills the given appointments of one client on a new invoice issued and paid in one step, at the Billed amounts TypeScript priced, with an optional Internal note (trimmed; blank is NULL). Pulls them off any draft (an emptied draft is deleted). Returns { invoice_id, invoice_number }.';

GRANT ALL ON FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text", "text") TO "service_role";

COMMENT ON COLUMN "public"."invoices"."internal_note" IS 'Admin-only note, never shown or printed for the client (not notes, which the client sees). NULL when empty. Written only by invoice_set_internal_note and, on a new invoice, invoice_create_draft and invoice_mark_paid.';
