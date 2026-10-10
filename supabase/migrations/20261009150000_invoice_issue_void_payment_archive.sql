-- Issue, void, Payment and archive: the invoice transitions after a draft is built.
--
-- Decisions #62 (numbering, payment, void, archive), #63 (counter, race, lock order); ADR
-- docs/adr/0001-invoice-writes-in-sql-functions-and-status-trigger.md; CONTEXT.md "Invoice
-- number", "Payment", "Payment method", "Archived invoice". Ticket 05 owns the draft functions;
-- nothing here creates or deletes an invoice or a line.
--
-- CONTRACT (every function)
--
--   * SECURITY DEFINER, search_path = public, owner postgres, one transaction. The first thing each
--     does is refuse a non-admin caller with invoice_error('not_admin'); EXECUTE stays granted
--     (revoking it crashes the PG 17.6 image, see 20260917120000).
--   * Lock order: the appointments of the invoice's lines (and any extra visits the call names), by
--     id, then the invoice row. Same order as employee_clock and the appointment triggers, so two
--     writers on one visit queue instead of deadlocking.
--   * Refusals, in this order: not_admin, invoice_not_found, archived_invoice (every write but
--     invoice_unarchive), invalid_status, then the function's own codes. Every refusal goes
--     through invoice_error, so DETAIL is the code.
--
-- FUNCTIONS
--
--   invoice_issue(invoice, lines jsonb, due_date) -> text, the Invoice number. Draft only. lines is
--     [{ appointment_id, billed_amount_cents, billed_rate_cents, billed_minutes }], priced by
--     TypeScript; SQL checks its shape and never recomputes a price. empty_lines when there are
--     none; draft_changed when its appointment ids (counted with repeats) differ from the draft's
--     live lines (an appointment_id that is not a uuid never matches); unpriced_line when an amount
--     is missing or not a whole non-negative integer, or a rate or minutes is present but isn't;
--     due_before_issue when the due date
--     is before the Business date. The number comes from invoice_number_counters, bumped by an
--     INSERT ... ON CONFLICT DO UPDATE that row-locks the year, so concurrent issues queue and the
--     count has no gaps; a voided number is never handed out again. Format
--     INV-<count, at least 3 digits>-<prefix><year>, prefix = the client's name unaccented,
--     letters only, upper case, first three, padded with X.
--   invoice_void(invoice). Issued or paid only. The invoice becomes void, keeps its number and
--     loses its Payment; every line is released (is_archived) so its visit can be billed again.
--     cancelled_at is left as is, and invoices_with_status still counts released lines on a void
--     invoice, so it keeps its original total (Franklin, 2026-10-09).
--   invoice_record_payment(invoice, paid_date, method, reference). Issued only. A null paid date
--     means today. paid_date_future when after the Business date (before the issue date is fine);
--     method_required when the method is blank. Whitespace runs in the method become one space; it is
--     matched to payment_methods ignoring case (payment_methods_name_lower_key, new here, makes
--     names unique ignoring case) and stored as that row's name; an unknown one joins the list
--     (unhidden, last). A blank reference is stored as null.
--   invoice_update_payment(...): same arguments and checks, paid only.
--   invoice_undo_payment(invoice): paid only; back to issued with no Payment. Overdue again if past
--     due, which invoices_with_status derives.
--   invoice_archive(invoice): draft, paid or void (an issued invoice is still owed). A draft's lines
--     are released, and an Automatic draft's visits become Excluded visits.
--   invoice_unarchive(invoice): archived only. A paid or void invoice just loses the flag. A draft
--     re-claims its uncancelled lines. Released while archived, its visits may have changed, so it
--     refuses visit_cancelled when one was cancelled, visit_other_client when one moved to another
--     client, and visit_claimed when one now has a Live claim elsewhere; no line is dropped. An Automatic draft comes back Automatic, with its visits no longer
--     Excluded, unless the client has opened another Automatic draft meanwhile or one of its visits is no
--     longer completed (reopened while archived): then it comes back as an ordinary draft and its
--     visits stay Excluded.
--
-- HELPERS, in the private schema (not exposed through PostgREST, see 20261004120000):
-- private.lock_invoice and private.lock_invoice_for_write hold the lock order and the shared
-- refusals; private.write_invoice_payment is the body of record and update payment. They run with
-- the caller's rights, which inside these functions are the definer's. Ticket 05 may want the same
-- locking; it can call these.
--
-- DOWN. Drops the functions and one index; no data or column changes. The unaccent extension stays (harmless).
--
--   DROP FUNCTION "public"."invoice_unarchive"("uuid");
--   DROP FUNCTION "public"."invoice_archive"("uuid");
--   DROP FUNCTION "public"."invoice_undo_payment"("uuid");
--   DROP FUNCTION "public"."invoice_update_payment"("uuid", "date", "text", "text");
--   DROP FUNCTION "public"."invoice_record_payment"("uuid", "date", "text", "text");
--   DROP FUNCTION "public"."invoice_void"("uuid");
--   DROP FUNCTION "public"."invoice_issue"("uuid", "jsonb", "date");
--   DROP INDEX "public"."payment_methods_name_lower_key";
--   DROP FUNCTION "private"."write_invoice_payment"("uuid", "text", "date", "text", "text");
--   DROP FUNCTION "private"."lock_invoice_for_write"("uuid", "text"[], "uuid"[]);
--   DROP FUNCTION "private"."is_invoice_count"("jsonb");
--   DROP FUNCTION "private"."invoice_line_uuid"("jsonb");
--   DROP FUNCTION "private"."lock_invoice"("uuid", "uuid"[]);


CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "extensions";


-- 1. Helpers -------------------------------------------------------------------------------------

CREATE FUNCTION "private"."lock_invoice"("p_invoice_id" "uuid", "p_extra_appointment_ids" "uuid"[] DEFAULT '{}'::"uuid"[])
    RETURNS "public"."invoices"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
	locked_invoice public.invoices;
BEGIN
	PERFORM 1
	FROM appointments
	WHERE appointments.id IN (
		SELECT invoice_appointments.appointment_id
		FROM invoice_appointments
		WHERE invoice_appointments.invoice_id = p_invoice_id
	)
		OR appointments.id = ANY (p_extra_appointment_ids)
	ORDER BY appointments.id
	FOR UPDATE;

	SELECT * INTO locked_invoice FROM invoices WHERE invoices.id = p_invoice_id FOR UPDATE;

	IF NOT FOUND THEN
		PERFORM invoice_error('invoice_not_found');
	END IF;

	RETURN locked_invoice;
END;
$$;

ALTER FUNCTION "private"."lock_invoice"("uuid", "uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "private"."lock_invoice"("uuid", "uuid"[]) IS 'Locks the appointments of the invoice''s lines plus any extra ones, by id, then the invoice row, and returns it. Refuses invoice_not_found.';


CREATE FUNCTION "private"."lock_invoice_for_write"("p_invoice_id" "uuid", "p_statuses" "text"[], "p_extra_appointment_ids" "uuid"[] DEFAULT '{}'::"uuid"[])
    RETURNS "public"."invoices"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
	locked_invoice public.invoices;
BEGIN
	locked_invoice := private.lock_invoice(p_invoice_id, p_extra_appointment_ids);

	IF locked_invoice.is_archived THEN
		PERFORM invoice_error('archived_invoice');
	END IF;

	IF NOT (locked_invoice.status = ANY (p_statuses)) THEN
		PERFORM invoice_error('invalid_status');
	END IF;

	RETURN locked_invoice;
END;
$$;

ALTER FUNCTION "private"."lock_invoice_for_write"("uuid", "text"[], "uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "private"."lock_invoice_for_write"("uuid", "text"[], "uuid"[]) IS 'lock_invoice, then refuses archived_invoice, and invalid_status unless the invoice is in one of p_statuses.';


CREATE FUNCTION "private"."invoice_line_uuid"("p_value" "jsonb") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
	SELECT CASE
		WHEN jsonb_typeof(p_value) = 'string'
			AND (p_value #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
		THEN (p_value #>> '{}')::uuid
	END;
$$;

ALTER FUNCTION "private"."invoice_line_uuid"("jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "private"."invoice_line_uuid"("jsonb") IS 'A p_lines appointment_id as a uuid, or null when it is not a uuid string, so a malformed line is refused with a code instead of a cast error.';


CREATE FUNCTION "private"."is_invoice_count"("p_value" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
	-- CASE, not AND: SQL doesn't promise to test the type before the cast.
	SELECT CASE
		WHEN jsonb_typeof(p_value) = 'number' THEN
			(p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
			AND (p_value #>> '{}')::numeric BETWEEN 0 AND 2147483647
		ELSE false
	END;
$$;

ALTER FUNCTION "private"."is_invoice_count"("jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "private"."is_invoice_count"("jsonb") IS 'True when a p_lines value is a whole, non-negative number that fits an integer column (cents or minutes).';


-- 2. invoice_issue -------------------------------------------------------------------------------

CREATE FUNCTION "public"."invoice_issue"("p_invoice_id" "uuid", "p_lines" "jsonb", "p_due_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	issued_on date := business_date();
	lines jsonb := CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END;
	passed_ids uuid[];
	draft_ids uuid[];
	locked_invoice public.invoices;
	invoice_count integer;
	client_prefix text;
	issued_number text;
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	-- A malformed appointment_id reads as null, which no draft line matches: draft_changed below.
	SELECT array_agg(private.invoice_line_uuid(line -> 'appointment_id')
		ORDER BY private.invoice_line_uuid(line -> 'appointment_id'))
	INTO passed_ids
	FROM jsonb_array_elements(lines) line;

	-- The passed visits are locked too, so a line added meanwhile can't slip past the compare below.
	locked_invoice := private.lock_invoice_for_write(p_invoice_id, ARRAY['draft'],
		coalesce(array_remove(passed_ids, NULL), '{}'));

	IF jsonb_array_length(lines) = 0 THEN
		PERFORM invoice_error('empty_lines');
	END IF;

	SELECT array_agg(invoice_appointments.appointment_id ORDER BY invoice_appointments.appointment_id)
	INTO draft_ids
	FROM invoice_appointments
	WHERE invoice_appointments.invoice_id = p_invoice_id
		AND NOT invoice_appointments.is_archived
		AND invoice_appointments.cancelled_at IS NULL;

	IF passed_ids IS DISTINCT FROM draft_ids THEN
		PERFORM invoice_error('draft_changed');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM jsonb_array_elements(lines) line
		WHERE NOT private.is_invoice_count(line -> 'billed_amount_cents')
			OR (coalesce(jsonb_typeof(line -> 'billed_rate_cents'), 'null') <> 'null'
				AND NOT private.is_invoice_count(line -> 'billed_rate_cents'))
			OR (coalesce(jsonb_typeof(line -> 'billed_minutes'), 'null') <> 'null'
				AND NOT private.is_invoice_count(line -> 'billed_minutes'))
	) THEN
		PERFORM invoice_error('unpriced_line');
	END IF;

	IF p_due_date < issued_on THEN
		PERFORM invoice_error('due_before_issue');
	END IF;

	-- The upsert row-locks the year's counter, so concurrent issues take turns and never share a count.
	INSERT INTO invoice_number_counters (year, last_value)
	VALUES (extract(year FROM issued_on)::integer, 1)
	ON CONFLICT (year) DO UPDATE SET last_value = invoice_number_counters.last_value + 1
	RETURNING last_value INTO invoice_count;

	-- rpad both cuts to three letters and pads a shorter name with X.
	SELECT rpad(upper(regexp_replace(
		extensions.unaccent('extensions.unaccent'::regdictionary, clients.name), '[^A-Za-z]', '', 'g')), 3, 'X')
	INTO client_prefix
	FROM clients
	WHERE clients.id = locked_invoice.client_id;

	-- lpad would truncate a count past 999, so the width grows with it.
	issued_number := 'INV-' || lpad(invoice_count::text, greatest(3, length(invoice_count::text)), '0')
		|| '-' || client_prefix || extract(year FROM issued_on)::text;

	UPDATE invoice_appointments
	SET billed_amount_cents = (line ->> 'billed_amount_cents')::numeric::integer,
		billed_rate_cents = (line ->> 'billed_rate_cents')::numeric::integer,
		billed_minutes = (line ->> 'billed_minutes')::numeric::integer
	FROM jsonb_array_elements(lines) line
	WHERE invoice_appointments.invoice_id = p_invoice_id
		AND invoice_appointments.appointment_id = private.invoice_line_uuid(line -> 'appointment_id')
		AND NOT invoice_appointments.is_archived
		AND invoice_appointments.cancelled_at IS NULL;

	UPDATE invoices
	SET status = 'issued', invoice_number = issued_number, issued_date = issued_on, due_date = p_due_date
	WHERE invoices.id = p_invoice_id;

	RETURN issued_number;
END;
$$;

ALTER FUNCTION "public"."invoice_issue"("uuid", "jsonb", "date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_issue"("uuid", "jsonb", "date") IS 'Issues a draft with the Billed amounts TypeScript priced: checks the line set still matches the draft, assigns the next Invoice number and returns it.';

GRANT ALL ON FUNCTION "public"."invoice_issue"("uuid", "jsonb", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_issue"("uuid", "jsonb", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_issue"("uuid", "jsonb", "date") TO "service_role";


-- 3. invoice_void --------------------------------------------------------------------------------

CREATE FUNCTION "public"."invoice_void"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	PERFORM private.lock_invoice_for_write(p_invoice_id, ARRAY['issued', 'paid']);

	UPDATE invoices
	SET status = 'void', paid_date = NULL, payment_method = NULL, payment_reference = NULL
	WHERE invoices.id = p_invoice_id;

	-- Released lines keep their Billed amounts: the void invoice still shows what it charged.
	UPDATE invoice_appointments
	SET is_archived = true
	WHERE invoice_appointments.invoice_id = p_invoice_id
		AND NOT invoice_appointments.is_archived;
END;
$$;

ALTER FUNCTION "public"."invoice_void"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_void"("uuid") IS 'Voids an issued or paid invoice: keeps its number and total, clears the Payment, releases every line so its visit can be billed again.';

GRANT ALL ON FUNCTION "public"."invoice_void"("uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_void"("uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_void"("uuid") TO "service_role";


-- 4. Payment -------------------------------------------------------------------------------------

-- A method is one name whatever its case, so a Payment typed as 'wire' finds Wire.
CREATE UNIQUE INDEX "payment_methods_name_lower_key" ON "public"."payment_methods" (lower("name"));

COMMENT ON INDEX "public"."payment_methods_name_lower_key" IS 'Payment method names are unique ignoring case.';

-- 5. Payment functions ---------------------------------------------------------------------------

CREATE FUNCTION "private"."write_invoice_payment"("p_invoice_id" "uuid", "p_status" "text", "p_paid_date" "date", "p_method" "text", "p_reference" "text")
    RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
	paid_on date := coalesce(p_paid_date, business_date());
	-- Any run of whitespace (tabs, newlines too) counts as one space, so 'Credit  card' is Credit card.
	typed_method text := btrim(regexp_replace(p_method, '\s+', ' ', 'g'));
	method_name text;
BEGIN
	PERFORM private.lock_invoice_for_write(p_invoice_id, ARRAY[p_status]);

	IF paid_on > business_date() THEN
		PERFORM invoice_error('paid_date_future');
	END IF;

	IF coalesce(typed_method, '') = '' THEN
		PERFORM invoice_error('method_required');
	END IF;

	-- A concurrent first use of the same method in another case loses the insert to
	-- payment_methods_name_lower_key and reads the winner's row back.
	INSERT INTO payment_methods (name, sort_order)
	SELECT typed_method, coalesce(max(payment_methods.sort_order), 0) + 1
	FROM payment_methods
	WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE lower(payment_methods.name) = lower(typed_method))
	ON CONFLICT DO NOTHING;

	SELECT payment_methods.name
	INTO method_name
	FROM payment_methods
	WHERE lower(payment_methods.name) = lower(typed_method);

	UPDATE invoices
	SET status = 'paid', paid_date = paid_on, payment_method = method_name,
		payment_reference = nullif(regexp_replace(p_reference, '^\s+|\s+$', '', 'g'), '')
	WHERE invoices.id = p_invoice_id;
END;
$$;

ALTER FUNCTION "private"."write_invoice_payment"("uuid", "text", "date", "text", "text") OWNER TO "postgres";

COMMENT ON FUNCTION "private"."write_invoice_payment"("uuid", "text", "date", "text", "text") IS 'Body of invoice_record_payment and invoice_update_payment: checks the date and method, adds an unknown method to payment_methods, writes the Payment on an invoice in p_status.';


CREATE FUNCTION "public"."invoice_record_payment"("p_invoice_id" "uuid", "p_paid_date" "date", "p_method" "text", "p_reference" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	PERFORM private.write_invoice_payment(p_invoice_id, 'issued', p_paid_date, p_method, p_reference);
END;
$$;

ALTER FUNCTION "public"."invoice_record_payment"("uuid", "date", "text", "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_record_payment"("uuid", "date", "text", "text") IS 'Records the Payment of an issued invoice. A null paid date means today; a new method joins payment_methods.';

GRANT ALL ON FUNCTION "public"."invoice_record_payment"("uuid", "date", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_record_payment"("uuid", "date", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_record_payment"("uuid", "date", "text", "text") TO "service_role";


CREATE FUNCTION "public"."invoice_update_payment"("p_invoice_id" "uuid", "p_paid_date" "date", "p_method" "text", "p_reference" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	PERFORM private.write_invoice_payment(p_invoice_id, 'paid', p_paid_date, p_method, p_reference);
END;
$$;

ALTER FUNCTION "public"."invoice_update_payment"("uuid", "date", "text", "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_update_payment"("uuid", "date", "text", "text") IS 'Edits the Payment of a paid invoice, with the same checks as invoice_record_payment.';

GRANT ALL ON FUNCTION "public"."invoice_update_payment"("uuid", "date", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_update_payment"("uuid", "date", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_update_payment"("uuid", "date", "text", "text") TO "service_role";


CREATE FUNCTION "public"."invoice_undo_payment"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	PERFORM private.lock_invoice_for_write(p_invoice_id, ARRAY['paid']);

	UPDATE invoices
	SET status = 'issued', paid_date = NULL, payment_method = NULL, payment_reference = NULL
	WHERE invoices.id = p_invoice_id;
END;
$$;

ALTER FUNCTION "public"."invoice_undo_payment"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_undo_payment"("uuid") IS 'Undoes the Payment of a paid invoice: back to issued (overdue again if past due) with no Payment.';

GRANT ALL ON FUNCTION "public"."invoice_undo_payment"("uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_undo_payment"("uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_undo_payment"("uuid") TO "service_role";


-- 6. Archive -------------------------------------------------------------------------------------

CREATE FUNCTION "public"."invoice_archive"("p_invoice_id" "uuid") RETURNS "void"
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
		-- An admin set this Automatic draft aside, so its visits must not rejoin the next one.
		IF locked_invoice.is_automatic THEN
			UPDATE appointments
			SET excluded_from_automatic = true
			WHERE appointments.id IN (
				SELECT invoice_appointments.appointment_id
				FROM invoice_appointments
				WHERE invoice_appointments.invoice_id = p_invoice_id
					AND NOT invoice_appointments.is_archived
			);
		END IF;

		UPDATE invoice_appointments
		SET is_archived = true
		WHERE invoice_appointments.invoice_id = p_invoice_id
			AND NOT invoice_appointments.is_archived;
	END IF;

	UPDATE invoices SET is_archived = true WHERE invoices.id = p_invoice_id;
END;
$$;

ALTER FUNCTION "public"."invoice_archive"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_archive"("uuid") IS 'Archives a draft, paid or void invoice. A draft releases its lines, and an Automatic draft''s visits become Excluded visits.';

GRANT ALL ON FUNCTION "public"."invoice_archive"("uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_archive"("uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_archive"("uuid") TO "service_role";


CREATE FUNCTION "public"."invoice_unarchive"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	locked_invoice public.invoices;
	stays_automatic boolean;
BEGIN
	IF get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM invoice_error('not_admin');
	END IF;

	locked_invoice := private.lock_invoice(p_invoice_id);

	IF NOT locked_invoice.is_archived THEN
		PERFORM invoice_error('invalid_status');
	END IF;

	stays_automatic := locked_invoice.is_automatic;

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

		-- A client has one Automatic draft at a time; if it opened another meanwhile, this one
		-- comes back as an ordinary draft and its visits stay Excluded.
		IF locked_invoice.is_automatic THEN
			stays_automatic := NOT EXISTS (
				SELECT 1
				FROM invoices
				WHERE invoices.client_id = locked_invoice.client_id
					AND invoices.id <> p_invoice_id
					AND invoices.is_automatic
					AND invoices.status = 'draft'
					AND NOT invoices.is_archived
			)
			-- An Automatic draft holds only completed visits; one reopened while archived makes it ordinary.
			AND NOT EXISTS (
				SELECT 1
				FROM invoice_appointments own_line
				JOIN appointments ON appointments.id = own_line.appointment_id
				WHERE own_line.invoice_id = p_invoice_id
					AND own_line.cancelled_at IS NULL
					AND appointments.status <> 'completed'
			);
		END IF;
	END IF;

	-- The check above can't see an Automatic draft another transaction is still opening; the
	-- one-per-client index can, and then this draft comes back ordinary instead.
	BEGIN
		UPDATE invoices
		SET is_archived = false, is_automatic = stays_automatic
		WHERE invoices.id = p_invoice_id;
	EXCEPTION WHEN unique_violation THEN
		stays_automatic := false;

		UPDATE invoices
		SET is_archived = false, is_automatic = false
		WHERE invoices.id = p_invoice_id;
	END;

	IF locked_invoice.status = 'draft' AND locked_invoice.is_automatic AND stays_automatic THEN
		UPDATE appointments
		SET excluded_from_automatic = false
		WHERE appointments.id IN (
			SELECT invoice_appointments.appointment_id
			FROM invoice_appointments
			WHERE invoice_appointments.invoice_id = p_invoice_id
				AND NOT invoice_appointments.is_archived
		);
	END IF;
END;
$$;

ALTER FUNCTION "public"."invoice_unarchive"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_unarchive"("uuid") IS 'Unarchives an invoice. A draft re-claims its lines (refused while a visit has a Live claim elsewhere) and an Automatic draft returns Automatic unless the client opened another one meanwhile.';

GRANT ALL ON FUNCTION "public"."invoice_unarchive"("uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_unarchive"("uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_unarchive"("uuid") TO "service_role";
