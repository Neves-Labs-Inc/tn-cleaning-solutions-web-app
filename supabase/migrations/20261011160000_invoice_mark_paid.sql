-- Mark paid: bill one or more of a client's appointments on a new invoice that is issued and paid
-- in one step, never sent.
--
-- Decision #109; ADR docs/adr/0001-invoice-writes-in-sql-functions-and-status-trigger.md; CONTEXT.md
-- "Mark paid", "Live claim", "Upcoming line", "Invoice number", "Payment method". Builds on
-- 20261009140000 (invoice_lock_visits), 20261009150000 (invoice_issue, write_invoice_payment) and
-- 20261011140000 (invoice_delete_if_empty).
--
-- CONTRACT
--
--   invoice_mark_paid(client, lines jsonb, paid_date, method, reference) -> jsonb
--     { "invoice_id": uuid, "invoice_number": text }. lines is [{ appointment_id,
--     billed_amount_cents }], priced by TypeScript; SQL checks the shape and never recomputes a
--     price. SECURITY DEFINER, search_path = public, owner postgres, one transaction.
--
--   * Refusals, in this order, all through invoice_error: not_admin; empty_lines (null or empty
--     list); visit_other_client (unknown client, or an unknown, malformed, archived or another
--     client's appointment); visit_cancelled; invoice_paid (the appointment's Live claim is on a
--     paid invoice); invoice_issued (Live claim on an issued invoice: the UI records the payment
--     of that invoice instead); unpriced_line (an amount missing, negative, not a whole number or
--     too big for an integer; $0 is fine); paid_date_future; method_required.
--   * Lock order: the named appointments by id, then the drafts that hold a Live claim on any of
--     them, by id. Same order as every other invoice write, so writers on one visit queue.
--   * An appointment on a draft leaves it: that line is deleted and a draft left with no live line
--     is deleted. The rest of the draft, and excluded_from_automatic, are untouched.
--   * Any appointment that isn't cancelled is allowed; one not completed yet is an Upcoming line.
--   * The new invoice: status paid, not Automatic, issued today (Business date), no due date, the
--     next Invoice number from the count invoice_issue uses, paid on paid_date (null = today). The
--     method is matched and added to payment_methods exactly as invoice_record_payment does; a
--     blank reference is null. One line per distinct appointment (a repeated one keeps its first
--     amount) with its Billed amount and no rate or minutes.
--   * Undo is the ordinary invoice_undo_payment (back to issued), then invoice_void.
--
-- HELPERS, factored out of invoice_issue and write_invoice_payment so Mark paid numbers and stores
-- methods the same way. Both keep their behaviour (invoice_transitions.test.sql).
--
--   private.next_invoice_number(client, issued_on) -> text: bumps the year's counter (the upsert
--     row-locks it, so concurrent callers queue and the count has no gaps) and formats
--     INV-<count, at least 3 digits>-<prefix><year>.
--   private.invoice_payment_method(method) -> text: collapses whitespace runs, refuses
--     method_required when blank, adds an unknown method (unhidden, last) and returns the name as
--     listed.
--
-- anon keeps EXECUTE through GRANT ALL like the other invoice functions (revoking it crashes the
-- Supabase image, see 20260917120000); the function refuses not_admin itself.
--
-- DOWN. Recreate invoice_issue (section 2) and write_invoice_payment (section 5) from
-- 20261009150000, then:
--
--   DROP FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text");
--   DROP FUNCTION "private"."invoice_payment_method"("text");
--   DROP FUNCTION "private"."next_invoice_number"("uuid", "date");
--
-- No data changes; invoices it created stay as ordinary paid invoices.


-- 1. Helpers -------------------------------------------------------------------------------------

CREATE FUNCTION "private"."next_invoice_number"("p_client_id" "uuid", "p_issued_on" "date") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
	invoice_count integer;
	client_prefix text;
	issued_number text;
BEGIN
	-- The upsert row-locks the year's counter, so concurrent issues take turns and never share a count.
	INSERT INTO invoice_number_counters (year, last_value)
	VALUES (extract(year FROM p_issued_on)::integer, 1)
	ON CONFLICT (year) DO UPDATE SET last_value = invoice_number_counters.last_value + 1
	RETURNING last_value INTO invoice_count;

	-- rpad both cuts to three letters and pads a shorter name with X.
	SELECT rpad(upper(regexp_replace(
		extensions.unaccent('extensions.unaccent'::regdictionary, clients.name), '[^A-Za-z]', '', 'g')), 3, 'X')
	INTO client_prefix
	FROM clients
	WHERE clients.id = p_client_id;

	-- lpad would truncate a count past 999, so the width grows with it.
	issued_number := 'INV-' || lpad(invoice_count::text, greatest(3, length(invoice_count::text)), '0')
		|| '-' || client_prefix || extract(year FROM p_issued_on)::text;

	RETURN issued_number;
END;
$$;

ALTER FUNCTION "private"."next_invoice_number"("uuid", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."next_invoice_number"("uuid", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."next_invoice_number"("uuid", "date") IS 'Takes the next Invoice number of the issue year for a client: bumps invoice_number_counters (row-locked, gapless) and formats INV-<count>-<prefix><year>.';


CREATE FUNCTION "private"."invoice_payment_method"("p_method" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
	-- Any run of whitespace (tabs, newlines too) counts as one space, so 'Credit  card' is Credit card.
	typed_method text := btrim(regexp_replace(p_method, '\s+', ' ', 'g'));
	method_name text;
BEGIN
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

	RETURN method_name;
END;
$$;

ALTER FUNCTION "private"."invoice_payment_method"("text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."invoice_payment_method"("text") FROM PUBLIC;

COMMENT ON FUNCTION "private"."invoice_payment_method"("text") IS 'The Payment method name to store for a typed method: whitespace collapsed, matched to payment_methods ignoring case, added (unhidden, last) when unknown. Refuses method_required when blank.';


-- 2. invoice_issue and write_invoice_payment on the helpers -------------------------------------

CREATE OR REPLACE FUNCTION "public"."invoice_issue"("p_invoice_id" "uuid", "p_lines" "jsonb", "p_due_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	issued_on date := business_date();
	lines jsonb := CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END;
	passed_ids uuid[];
	draft_ids uuid[];
	locked_invoice public.invoices;
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

	issued_number := private.next_invoice_number(locked_invoice.client_id, issued_on);

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


CREATE OR REPLACE FUNCTION "private"."write_invoice_payment"("p_invoice_id" "uuid", "p_status" "text", "p_paid_date" "date", "p_method" "text", "p_reference" "text")
    RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
	paid_on date := coalesce(p_paid_date, business_date());
	method_name text;
BEGIN
	PERFORM private.lock_invoice_for_write(p_invoice_id, ARRAY[p_status]);

	IF paid_on > business_date() THEN
		PERFORM invoice_error('paid_date_future');
	END IF;

	method_name := private.invoice_payment_method(p_method);

	UPDATE invoices
	SET status = 'paid', paid_date = paid_on, payment_method = method_name,
		payment_reference = nullif(regexp_replace(p_reference, '^\s+|\s+$', '', 'g'), '')
	WHERE invoices.id = p_invoice_id;
END;
$$;


-- 3. invoice_mark_paid ---------------------------------------------------------------------------

CREATE FUNCTION "public"."invoice_mark_paid"("p_client_id" "uuid", "p_lines" "jsonb", "p_paid_date" "date", "p_method" "text", "p_reference" "text") RETURNS "jsonb"
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

	INSERT INTO invoices (client_id, status, is_automatic, invoice_number, issued_date, due_date,
		paid_date, payment_method, payment_reference)
	VALUES (p_client_id, 'paid', false, new_number, issued_on, NULL,
		paid_on, method_name, nullif(regexp_replace(p_reference, '^\s+|\s+$', '', 'g'), ''))
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

ALTER FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text") IS 'Mark paid: bills the given appointments of one client on a new invoice issued and paid in one step, at the Billed amounts TypeScript priced. Pulls them off any draft (an emptied draft is deleted). Returns { invoice_id, invoice_number }.';

GRANT ALL ON FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoice_mark_paid"("uuid", "jsonb", "date", "text", "text") TO "service_role";
