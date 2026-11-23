-- Payroll: Split payout. A paid Pay run's payout divided across two or more Payout methods on its
-- one paid date.
--
-- .scratch/invoices-update/spec.md and ticket 01; CONTEXT.md "Split payout", "Payout method".
-- Builds on 20261014233000 (Mark paid, check_payout, update_pay_run_payout) and 20261014234000
-- (My pay views). Business time is America/Toronto.
--
-- STORAGE. pay_runs.split_parts jsonb: NULL for a run paid one way, otherwise the ordered array
-- [{ "method": text, "amount_cents": bigint }] of two or more parts. A split run has
-- payout_method NULL, so it never reads as a single-method run to a reader of payout_method.
-- Nothing is backfilled: every existing paid run is single-method and keeps split_parts NULL.
--
-- READ INTERFACE. Every reader of a paid run's payout gets `payout_parts`, the same ordered array
-- for both kinds: the stored parts for a split run, one element { method: payout_method,
-- amount_cents: the run's total } for a single-method run, NULL for a run that isn't paid. The one
-- definition is private.pay_run_payout_parts(pay_runs). It is exposed by
--
--   * public.pay_runs_with_payout_parts (admin only through the pay_runs RLS): the admin read of
--     runs that feeds src/lib/payroll/period-view.ts and the Payroll export;
--   * public.pay_runs_employee_view (My pay): gains payout_parts; still only the caller's own
--     paid runs (private.my_paid_pay_run_ids).
--
-- RULES (the dialog module src/lib/payroll/mark-paid.ts mirrors them). A split needs:
--   split_too_few_parts       fewer than two parts (or parts that aren't a JSON array)
--   method_required           a part whose method is blank after trimming
--   split_part_not_positive   a part whose amount isn't a whole number of cents above 0
--   split_duplicate_method    two parts with the same method, trimmed and case-insensitive
--   paid_on_required / paid_on_future / paid_on_before_period_end   unchanged paid-date rules
--   split_not_allowed         the run's total is $0 or less
--   split_sum_mismatch        the parts don't add up to the run's total, exactly
-- checked in that order. The total is the one frozen at Mark paid (checked after the lines are
-- frozen; the refusal rolls the whole call back, so nothing is written) and the stored total for
-- Edit payout.
--
-- FUNCTIONS
--
--   mark_pay_run_paid_with_parts(run_id, parts jsonb, paid_on). Marks one finalized run paid
--     exactly like a single-method Mark paid (releases claims, freezes lines, locks clocks) and
--     records the parts. Raises payroll_error. Refusals: not_admin, run_not_found, not_finalized,
--     blocked, then the rules above.
--   update_pay_run_payout(run_id, payout_method, paid_on, parts jsonb DEFAULT NULL). Replaces a
--     paid run's whole payout: one method (parts NULL) or a split (parts set, method NULL). Covers
--     single -> split, split -> single and split -> split. The run stays paid; frozen amounts
--     untouched. Refusals: not_admin, run_not_found, not_paid, then the rules above.
--   mark_pay_runs_paid: unchanged (one method per run). Its worker, private.mark_pay_run_paid,
--     gained an optional parts argument.
--
-- payroll_error is replaced to add the split_* codes. Its CASE block stays the only WHEN '...'
-- THEN in its body; src/lib/payroll/errors.ts mirrors this, the newest definition.
--
-- DOWN. Paid runs and frozen lines stay as they are. A split run has no single method to fall back
-- to, so turn every split into a single-method run first (update_pay_run_payout), then:
--
--   DROP FUNCTION "public"."update_pay_run_payout"("uuid", "text", "date", "jsonb");
--   DROP FUNCTION "public"."mark_pay_run_paid_with_parts"("uuid", "jsonb", "date");
--   DROP VIEW "public"."pay_runs_with_payout_parts";
--   DROP VIEW "public"."pay_runs_employee_view";
--   DROP FUNCTION "private"."pay_runs_employee_view"();
--   re-run its function (section 2) and view (section 3, with the GRANT/REVOKE at the end) from
--   20261014234000.
--   DROP FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "jsonb", "date");
--   DROP FUNCTION "private"."edit_pay_run_payout"("uuid", "text", "jsonb", "date");
--   re-create the 3-argument private.mark_pay_run_paid (section 2), mark_pay_runs_paid (section 3)
--   and update_pay_run_payout (section 4, the 3-argument one) from 20261014233000 with CREATE OR REPLACE.
--   DROP FUNCTION "private"."check_split_total"("jsonb", bigint);
--   DROP FUNCTION "private"."check_split_parts"("jsonb");
--   DROP FUNCTION "private"."pay_run_payout_parts"("public"."pay_runs");
--   DROP FUNCTION "private"."pay_run_total_cents"("uuid");
--   DROP FUNCTION "private"."check_paid_on"("public"."pay_runs", "date");   (after check_payout is restored)
--   ALTER TABLE "public"."pay_runs" DROP CONSTRAINT "pay_runs_split_parts_check";
--   ALTER TABLE "public"."pay_runs" DROP CONSTRAINT "pay_runs_paid_shape_check";
--   ALTER TABLE "public"."pay_runs" DROP COLUMN "split_parts";
--   ALTER TABLE "public"."pay_runs" ADD CONSTRAINT "pay_runs_paid_shape_check" CHECK (
--       "status" <> 'paid'
--       OR ("paid_on" IS NOT NULL AND "paid_at" IS NOT NULL AND "btrim"(coalesce("payout_method", '')) <> ''));
--   re-run check_payout (section 2) and payroll_error (section 1) from 20261014233000.


-- 1. payroll_error -------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."payroll_error"("code" "text", "hint" "text" DEFAULT NULL) RETURNS "void"
    LANGUAGE "plpgsql"
    -- VOLATILE (the default) on purpose: a constant-folded call would raise at plan time.
    SET "search_path" TO ''
    AS $$
DECLARE
	error_message text;
BEGIN
	error_message := CASE code
		WHEN 'not_admin' THEN 'Only an admin can change payroll.'
		WHEN 'period_not_ended' THEN 'This Pay period hasn''t ended yet.'
		WHEN 'before_payroll_start' THEN 'This Pay period is before the Payroll start.'
		WHEN 'nothing_to_finalize' THEN 'There''s no draft Pay run to finalize.'
		WHEN 'blocked' THEN 'Fix this Cleaner''s problem sessions and Pay rate to finalize.'
		WHEN 'run_not_found' THEN 'This Pay run no longer exists.'
		WHEN 'not_finalized' THEN 'This Pay run isn''t finalized, or it''s already paid.'
		WHEN 'has_later_run' THEN 'This Cleaner has an off-cycle run in this period, so this run can''t go back to draft.'
		WHEN 'run_paid' THEN 'This Pay run is paid and can''t change.'
		WHEN 'amount_required' THEN 'An Adjustment needs an amount other than $0.'
		WHEN 'reason_required' THEN 'An Adjustment needs a reason.'
		WHEN 'appointment_not_on_run' THEN 'That appointment isn''t on this Pay run.'
		WHEN 'adjustment_not_found' THEN 'This Adjustment no longer exists.'
		WHEN 'already_in_period' THEN 'This Cleaner already has a Pay run in this period.'
		WHEN 'run_not_empty' THEN 'This Pay run has shifts, Adjustments or problem sessions, so it can''t be removed.'
		WHEN 'no_stragglers' THEN 'This Cleaner has no unpaid shifts after finalize in this period.'
		WHEN 'draft_exists' THEN 'This Cleaner already has an unpaid off-cycle run in this period.'
		WHEN 'method_required' THEN 'Enter a Payout method.'
		WHEN 'paid_on_required' THEN 'Enter the paid date.'
		WHEN 'paid_on_future' THEN 'The paid date can''t be in the future.'
		WHEN 'paid_on_before_period_end' THEN 'The paid date can''t be before the Pay period ends.'
		WHEN 'not_paid' THEN 'Only a paid Pay run''s payout can be edited.'
		WHEN 'split_too_few_parts' THEN 'A split payout needs at least two parts.'
		WHEN 'split_part_not_positive' THEN 'Each part of a split payout needs an amount above $0.'
		WHEN 'split_duplicate_method' THEN 'Each part of a split payout needs a different Payout method.'
		WHEN 'split_sum_mismatch' THEN 'The parts of a split payout must add up to the run''s total.'
		WHEN 'split_not_allowed' THEN 'A Pay run with a total of $0 or less can''t be split.'
	END;

	-- A typo in a caller's code must fail loudly, not raise a blank message.
	IF error_message IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = 'Unknown payroll error: ' || coalesce(code, 'null'),
			DETAIL = 'unknown_payroll_error', ERRCODE = 'P0001';
	END IF;

	-- RAISE refuses a null option, so the hint is only attached when there is one.
	IF hint IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = error_message, DETAIL = code, ERRCODE = 'P0001';
	END IF;
	RAISE EXCEPTION USING MESSAGE = error_message, DETAIL = code, HINT = hint, ERRCODE = 'P0001';
END;
$$;


-- 2. Storage -------------------------------------------------------------------------------------

ALTER TABLE "public"."pay_runs" ADD COLUMN "split_parts" "jsonb";

COMMENT ON COLUMN "public"."pay_runs"."split_parts" IS 'The ordered parts [{ method, amount_cents }] of a Split payout, two or more; NULL when the run was paid one way (payout_method). Readers use payout_parts, which covers both.';

ALTER TABLE "public"."pay_runs" DROP CONSTRAINT "pay_runs_paid_shape_check";

-- A paid run names its payout one way: a single method, or two or more parts with no single method.
ALTER TABLE "public"."pay_runs" ADD CONSTRAINT "pay_runs_paid_shape_check" CHECK (
    "status" <> 'paid'
    OR (
        "paid_on" IS NOT NULL AND "paid_at" IS NOT NULL
        AND ("btrim"(coalesce("payout_method", '')) <> '' OR "split_parts" IS NOT NULL)
    )
);

ALTER TABLE "public"."pay_runs" ADD CONSTRAINT "pay_runs_split_parts_check" CHECK (
    "split_parts" IS NULL
    OR (
        "status" = 'paid'
        AND "payout_method" IS NULL
        -- CASE, because AND doesn't promise to stop before jsonb_array_length rejects a non-array.
        AND CASE WHEN "jsonb_typeof"("split_parts") = 'array' THEN "jsonb_array_length"("split_parts") >= 2 ELSE false END
    )
);


-- 3. Helpers -------------------------------------------------------------------------------------

-- Frozen shift pay plus Adjustments; only meaningful once the lines are frozen. bigint, so a long
-- run of large amounts can't overflow int4.
CREATE FUNCTION "private"."pay_run_total_cents"("p_run_id" "uuid") RETURNS bigint
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
    SELECT coalesce(( SELECT sum("line"."amount_cents") FROM "public"."pay_run_lines" "line" WHERE "line"."pay_run_id" = "p_run_id"), 0)
        + coalesce(( SELECT sum("adj"."amount_cents") FROM "public"."pay_adjustments" "adj" WHERE "adj"."pay_run_id" = "p_run_id"), 0);
$$;

ALTER FUNCTION "private"."pay_run_total_cents"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "private"."pay_run_total_cents"("uuid") IS 'A Pay run''s total: its frozen lines plus its Adjustments. Runs with the caller''s rights, so the caller must be able to read the lines.';

GRANT EXECUTE ON FUNCTION "private"."pay_run_total_cents"("uuid") TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."pay_run_total_cents"("uuid") TO "service_role";


-- The one definition of payout_parts, shared by the admin view and the My pay view.
CREATE FUNCTION "private"."pay_run_payout_parts"("p_run" "public"."pay_runs") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
    SELECT CASE
        WHEN "p_run"."status" <> 'paid' THEN NULL
        WHEN "p_run"."split_parts" IS NOT NULL THEN "p_run"."split_parts"
        ELSE "jsonb_build_array"("jsonb_build_object"(
            'method', "p_run"."payout_method",
            'amount_cents', "private"."pay_run_total_cents"("p_run"."id")
        ))
    END;
$$;

ALTER FUNCTION "private"."pay_run_payout_parts"("public"."pay_runs") OWNER TO "postgres";

COMMENT ON FUNCTION "private"."pay_run_payout_parts"("public"."pay_runs") IS 'A paid Pay run''s payout as an ordered array of { method, amount_cents }: the stored parts of a split run, one part holding the whole total for a single-method run, NULL for a run that isn''t paid. Runs with the caller''s rights.';

GRANT EXECUTE ON FUNCTION "private"."pay_run_payout_parts"("public"."pay_runs") TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."pay_run_payout_parts"("public"."pay_runs") TO "service_role";


-- The paid-date rules, split out of check_payout so a split payout shares them.
CREATE FUNCTION "private"."check_paid_on"("p_run" "public"."pay_runs", "p_paid_on" "date")
    RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	IF p_paid_on IS NULL THEN
		PERFORM public.payroll_error('paid_on_required');
	END IF;
	IF p_paid_on > (now() AT TIME ZONE 'America/Toronto')::date THEN
		PERFORM public.payroll_error('paid_on_future');
	END IF;
	-- A period ends 13 days after it starts; paying on its last day is fine.
	IF p_paid_on < p_run.period_start + 13 THEN
		PERFORM public.payroll_error('paid_on_before_period_end');
	END IF;
END;
$$;

ALTER FUNCTION "private"."check_paid_on"("public"."pay_runs", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."check_paid_on"("public"."pay_runs", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."check_paid_on"("public"."pay_runs", "date") IS 'Refuses a paid date that is missing, after the Toronto Business date or before the run''s Pay period end.';


-- Same contract as in 20261014233000, now built on check_paid_on.
CREATE OR REPLACE FUNCTION "private"."check_payout"("p_run" "public"."pay_runs", "p_payout_method" "text", "p_paid_on" "date")
    RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	IF coalesce(btrim(p_payout_method), '') = '' THEN
		PERFORM public.payroll_error('method_required');
	END IF;
	PERFORM private.check_paid_on(p_run, p_paid_on);
END;
$$;


-- The rules that need only the parts. Returns them normalized: methods trimmed, amounts as whole
-- cents, order kept. Everything in p_parts is untrusted input.
CREATE FUNCTION "private"."check_split_parts"("p_parts" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	normalized jsonb;
BEGIN
	-- The CASE hands jsonb_array_length NULL for a non-array, which it rejects otherwise.
	IF coalesce(jsonb_array_length(CASE WHEN jsonb_typeof(p_parts) = 'array' THEN p_parts END), 0) < 2 THEN
		PERFORM public.payroll_error('split_too_few_parts');
	END IF;

	IF EXISTS (
		SELECT 1 FROM jsonb_array_elements(p_parts) AS part
		WHERE jsonb_typeof(part -> 'method') IS DISTINCT FROM 'string' OR btrim(part ->> 'method') = ''
	) THEN
		PERFORM public.payroll_error('method_required');
	END IF;

	-- The CASE keeps the cast away from anything that isn't a JSON number.
	IF EXISTS (
		SELECT 1
		FROM (
			SELECT CASE WHEN jsonb_typeof(part -> 'amount_cents') = 'number' THEN (part ->> 'amount_cents')::numeric END AS amount
			FROM jsonb_array_elements(p_parts) AS part
		) AS amounts
		WHERE amount IS NULL OR amount <= 0 OR amount <> trunc(amount)
	) THEN
		PERFORM public.payroll_error('split_part_not_positive');
	END IF;

	IF (
		SELECT count(DISTINCT lower(btrim(part ->> 'method'))) FROM jsonb_array_elements(p_parts) AS part
	) < jsonb_array_length(p_parts) THEN
		PERFORM public.payroll_error('split_duplicate_method');
	END IF;

	SELECT jsonb_agg(
		jsonb_build_object('method', btrim(part ->> 'method'), 'amount_cents', (part ->> 'amount_cents')::numeric::bigint)
		ORDER BY ordinal
	) INTO normalized
	FROM jsonb_array_elements(p_parts) WITH ORDINALITY AS element(part, ordinal);

	RETURN normalized;
END;
$$;

ALTER FUNCTION "private"."check_split_parts"("jsonb") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."check_split_parts"("jsonb") FROM PUBLIC;

COMMENT ON FUNCTION "private"."check_split_parts"("jsonb") IS 'Refuses parts that are fewer than two, have a blank method, an amount that isn''t whole cents above 0, or a repeated method (trimmed, case-insensitive). Returns the parts normalized.';


-- The rules that need the run's total; p_parts is already normalized.
CREATE FUNCTION "private"."check_split_total"("p_parts" "jsonb", "p_total" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	IF p_total <= 0 THEN
		PERFORM public.payroll_error('split_not_allowed');
	END IF;
	IF (SELECT sum((part ->> 'amount_cents')::bigint) FROM jsonb_array_elements(p_parts) AS part) <> p_total THEN
		PERFORM public.payroll_error('split_sum_mismatch');
	END IF;
END;
$$;

ALTER FUNCTION "private"."check_split_total"("jsonb", bigint) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."check_split_total"("jsonb", bigint) FROM PUBLIC;

COMMENT ON FUNCTION "private"."check_split_total"("jsonb", bigint) IS 'Refuses a split on a run whose total is $0 or less (split_not_allowed) and parts that don''t add up to it exactly (split_sum_mismatch).';


-- 4. mark_pay_run_paid ---------------------------------------------------------------------------

-- Gains p_parts: NULL pays one way with p_payout_method (as before), an array records a split.
DROP FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "date");

CREATE FUNCTION "private"."mark_pay_run_paid"("p_run_id" "uuid", "p_payout_method" "text", "p_parts" "jsonb", "p_paid_on" "date")
    RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	run public.pay_runs;
	counts record;
	unfrozen_count integer;
	v_parts jsonb;
BEGIN
	-- Read unlocked to learn whose run it is, then lock in order and read it again.
	SELECT * INTO run FROM public.pay_runs WHERE pay_runs.id = p_run_id;
	IF run.id IS NULL THEN
		PERFORM public.payroll_error('run_not_found');
	END IF;

	PERFORM private.lock_pay_period(run.employee_id, run.period_start);

	SELECT * INTO run FROM public.pay_runs WHERE pay_runs.id = p_run_id;
	IF run.id IS NULL THEN
		PERFORM public.payroll_error('run_not_found');
	END IF;
	IF run.status <> 'finalized' THEN
		PERFORM public.payroll_error('not_finalized');
	END IF;

	IF p_parts IS NULL THEN
		PERFORM private.check_payout(run, p_payout_method, p_paid_on);
	ELSE
		v_parts := private.check_split_parts(p_parts);
		PERFORM private.check_paid_on(run, p_paid_on);
	END IF;

	-- Every claimed, payable session must still be closed with a Pay rate: clocks can be cleared
	-- and rates archived after finalize.
	SELECT
		count(*) FILTER (WHERE sessions.state IN ('open', 'in_progress'))::integer AS open_shift,
		count(*) FILTER (WHERE sessions.state IN ('not_clocked', 'upcoming'))::integer AS missing_clock,
		count(*) FILTER (WHERE sessions.has_no_rate)::integer AS no_rate
	INTO counts
	FROM public.pay_period_sessions AS sessions
	WHERE sessions.pay_run_id = run.id
		AND sessions.is_payable;

	IF counts.open_shift + counts.missing_clock + counts.no_rate > 0 THEN
		PERFORM public.payroll_error('blocked', jsonb_build_object(
			'open_shift', counts.open_shift, 'missing_clock', counts.missing_clock, 'no_rate', counts.no_rate
		)::text);
	END IF;

	-- Cancelled visits and Removed sessions never pay; let go of them rather than freeze them.
	DELETE FROM public.pay_run_lines AS line
	USING public.appointment_employees AS session, public.appointments AS visit
	WHERE line.pay_run_id = run.id
		AND session.id = line.appointment_employee_id
		AND visit.id = session.appointment_id
		AND (coalesce(session.is_archived, false) OR coalesce(visit.is_archived, false) OR visit.status = 'cancelled');

	-- Read the view before the status changes: once paid it reports the frozen columns instead.
	UPDATE public.pay_run_lines AS line
	SET scheduled_date = sessions.scheduled_date,
		client_name = sessions.client_name,
		job_name = sessions.job_name,
		minutes = sessions.clocked_minutes,
		rate_cents = sessions.effective_rate_cents,
		amount_cents = sessions.amount_cents
	FROM public.pay_period_sessions AS sessions
	WHERE line.pay_run_id = run.id
		AND sessions.appointment_employee_id = line.appointment_employee_id;

	-- A claim the view no longer shows (a visit moved before the Payroll start) can't be frozen;
	-- paying it as all NULLs would hide a shift the Cleaner was paid for.
	SELECT count(*) INTO unfrozen_count
	FROM public.pay_run_lines
	WHERE pay_run_lines.pay_run_id = run.id
		AND pay_run_lines.amount_cents IS NULL;

	IF unfrozen_count > 0 THEN
		RAISE EXCEPTION 'Pay run % has % claimed session(s) the pay view no longer shows', run.id, unfrozen_count;
	END IF;

	-- The parts must match the total just frozen. Raising here undoes the freeze above with the
	-- rest of the statement, so a refused split writes nothing.
	IF v_parts IS NOT NULL THEN
		PERFORM private.check_split_total(v_parts, private.pay_run_total_cents(run.id));
	END IF;

	UPDATE public.pay_runs
	SET status = 'paid', paid_on = p_paid_on, paid_at = now(),
		payout_method = CASE WHEN v_parts IS NULL THEN btrim(p_payout_method) END,
		split_parts = v_parts
	WHERE pay_runs.id = run.id;
END;
$$;

ALTER FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "jsonb", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "jsonb", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "jsonb", "date") IS 'Marks one finalized Pay run paid: releases claims that no longer pay, freezes every remaining line and records the payout (one method, or the parts of a split when p_parts is set), raising payroll_error on a refusal. Called by mark_pay_runs_paid per item and by mark_pay_run_paid_with_parts.';


-- 5. mark_pay_runs_paid (one method per run, as before) -----------------------------------------

CREATE OR REPLACE FUNCTION "public"."mark_pay_runs_paid"("p_items" "jsonb", "p_paid_on" "date")
    RETURNS TABLE ("pay_run_id" "uuid", "code" "text", "message" "text", "detail" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	item record;
	refusal_hint text;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	-- Sorted by Cleaner and period, so concurrent bulk calls take the Cleaners' locks in one order.
	FOR item IN
		SELECT items.run_id, items.payout_method
		FROM (
			SELECT (element ->> 'run_id')::uuid AS run_id, element ->> 'payout_method' AS payout_method
			FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) AS element
		) AS items
		LEFT JOIN public.pay_runs ON pay_runs.id = items.run_id
		ORDER BY pay_runs.employee_id, pay_runs.period_start, items.run_id
	LOOP
		pay_run_id := item.run_id;
		code := 'ok';
		message := NULL;
		detail := NULL;

		-- The block is a savepoint: a refused item undoes only its own writes.
		BEGIN
			PERFORM private.mark_pay_run_paid(item.run_id, item.payout_method, NULL, p_paid_on);
		EXCEPTION WHEN sqlstate 'P0001' THEN
			GET STACKED DIAGNOSTICS code = PG_EXCEPTION_DETAIL, message = MESSAGE_TEXT, refusal_hint = PG_EXCEPTION_HINT;
			detail := nullif(refusal_hint, '')::jsonb;
		END;

		RETURN NEXT;
	END LOOP;
END;
$$;


-- 6. mark_pay_run_paid_with_parts ----------------------------------------------------------------

CREATE FUNCTION "public"."mark_pay_run_paid_with_parts"("p_run_id" "uuid", "p_parts" "jsonb", "p_paid_on" "date")
    RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	-- A NULL is "no parts", never "no split": the worker would read NULL as a single method.
	PERFORM private.mark_pay_run_paid(p_run_id, NULL, coalesce(p_parts, '[]'::jsonb), p_paid_on);
END;
$$;

ALTER FUNCTION "public"."mark_pay_run_paid_with_parts"("uuid", "jsonb", "date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."mark_pay_run_paid_with_parts"("uuid", "jsonb", "date") IS 'Marks one finalized Pay run paid on paid_on with a Split payout: parts is [{ method, amount_cents }], two or more, adding up to the run''s total. Frozen lines and locks as with a single-method Mark paid. Raises payroll_error on a refusal. Admin only.';


-- 7. Edit payout ---------------------------------------------------------------------------------

-- Replaces a paid run's whole payout: p_parts NULL means one method, else a split.
CREATE FUNCTION "private"."edit_pay_run_payout"("p_run_id" "uuid", "p_payout_method" "text", "p_parts" "jsonb", "p_paid_on" "date")
    RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	run public.pay_runs;
	v_parts jsonb;
BEGIN
	SELECT * INTO run FROM public.pay_runs WHERE pay_runs.id = p_run_id;
	IF run.id IS NULL THEN
		PERFORM public.payroll_error('run_not_found');
	END IF;

	PERFORM private.lock_pay_period(run.employee_id, run.period_start);

	SELECT * INTO run FROM public.pay_runs WHERE pay_runs.id = p_run_id;
	IF run.id IS NULL THEN
		PERFORM public.payroll_error('run_not_found');
	END IF;
	IF run.status <> 'paid' THEN
		PERFORM public.payroll_error('not_paid');
	END IF;

	IF p_parts IS NULL THEN
		PERFORM private.check_payout(run, p_payout_method, p_paid_on);
	ELSE
		v_parts := private.check_split_parts(p_parts);
		PERFORM private.check_paid_on(run, p_paid_on);
		PERFORM private.check_split_total(v_parts, private.pay_run_total_cents(run.id));
	END IF;

	UPDATE public.pay_runs
	SET paid_on = p_paid_on,
		payout_method = CASE WHEN v_parts IS NULL THEN btrim(p_payout_method) END,
		split_parts = v_parts
	WHERE pay_runs.id = run.id;
END;
$$;

ALTER FUNCTION "private"."edit_pay_run_payout"("uuid", "text", "jsonb", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."edit_pay_run_payout"("uuid", "text", "jsonb", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."edit_pay_run_payout"("uuid", "text", "jsonb", "date") IS 'Replaces a paid Pay run''s whole payout (one method, or a split when p_parts is set) and its paid date, with the Mark paid rules. The run stays paid. Called by update_pay_run_payout.';


-- One function for every edit: p_parts NULL sets one method, else the split (p_payout_method is then
-- ignored; pass NULL). The signature changes, so the 3-argument one is replaced.
DROP FUNCTION "public"."update_pay_run_payout"("uuid", "text", "date");

CREATE FUNCTION "public"."update_pay_run_payout"("p_run_id" "uuid", "p_payout_method" "text", "p_paid_on" "date", "p_parts" "jsonb" DEFAULT NULL)
    RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	PERFORM private.edit_pay_run_payout(p_run_id, p_payout_method, p_parts, p_paid_on);
END;
$$;

ALTER FUNCTION "public"."update_pay_run_payout"("uuid", "text", "date", "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."update_pay_run_payout"("uuid", "text", "date", "jsonb") IS 'Replaces a paid Pay run''s whole payout and its paid date, with the Mark paid rules: one Payout method (p_parts NULL) or a Split payout (p_parts [{ method, amount_cents }], two or more, adding up to the run''s total). Single to split, split to single and split to split. The run stays paid. Admin only.';


-- 8. Readers -------------------------------------------------------------------------------------

-- The admin read of runs. Invoker rights: the pay_runs RLS keeps it admin-only.
CREATE VIEW "public"."pay_runs_with_payout_parts" WITH ("security_invoker" = 'true') AS
 SELECT "id",
    "employee_id",
    "period_start",
    "kind",
    "status",
    "paid_on",
    "payout_method",
    "private"."pay_run_payout_parts"("pay_runs") AS "payout_parts"
   FROM "public"."pay_runs";

ALTER VIEW "public"."pay_runs_with_payout_parts" OWNER TO "postgres";

COMMENT ON VIEW "public"."pay_runs_with_payout_parts" IS 'Admin-only. Pay runs with payout_parts: for a paid run the ordered array of { method, amount_cents } (one part holding the total for a single-method run), NULL otherwise. payout_method is NULL on a split run.';

REVOKE ALL ON TABLE "public"."pay_runs_with_payout_parts" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."pay_runs_with_payout_parts" TO "authenticated";

GRANT SELECT ON TABLE "public"."pay_runs_with_payout_parts" TO "service_role";


-- My pay: the function's columns change, so the view and function are re-created together.
DROP VIEW "public"."pay_runs_employee_view";

DROP FUNCTION "private"."pay_runs_employee_view"();

CREATE FUNCTION "private"."pay_runs_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "period_start" "date",
        "kind" "text",
        "paid_on" "date",
        "payout_method" "text",
        "total_cents" bigint,
        "payout_parts" "jsonb"
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "run"."id",
        "run"."period_start",
        "run"."kind",
        "run"."paid_on",
        "run"."payout_method",
        "private"."pay_run_total_cents"("run"."id"),
        "private"."pay_run_payout_parts"("run")
       FROM "public"."pay_runs" "run"
      WHERE "run"."id" IN ( SELECT "private"."my_paid_pay_run_ids"());
$$;

ALTER FUNCTION "private"."pay_runs_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."pay_runs_employee_view"() IS 'Rows of pay_runs_employee_view: the caller''s own paid Pay runs with their total (frozen lines plus Adjustments) and payout_parts. Runs with definer rights because pay_runs is admin-only.';

GRANT EXECUTE ON FUNCTION "private"."pay_runs_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."pay_runs_employee_view"() TO "service_role";

CREATE VIEW "public"."pay_runs_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "period_start",
    "kind",
    "paid_on",
    "payout_method",
    "total_cents",
    "payout_parts"
   FROM "private"."pay_runs_employee_view"();

ALTER VIEW "public"."pay_runs_employee_view" OWNER TO "postgres";

COMMENT ON VIEW "public"."pay_runs_employee_view" IS 'The calling Cleaner''s own paid Pay runs for My pay: period, kind, paid date, Payout method (NULL on a Split payout), total and payout_parts, the ordered { method, amount_cents } parts. Runs with the caller''s rights over private.pay_runs_employee_view(), which applies the row filter. Admins get no rows.';

REVOKE ALL ON TABLE "public"."pay_runs_employee_view" FROM "anon", "authenticated", "service_role";

GRANT SELECT ON TABLE "public"."pay_runs_employee_view" TO "authenticated", "service_role";
