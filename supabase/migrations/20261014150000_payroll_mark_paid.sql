-- Payroll: Mark paid, payout edits and frozen amounts.
--
-- .scratch/payroll-v2/spec.md and ticket 03; CONTEXT.md "Pay run", "Payout method". Builds on
-- 20261014120000 (tables, pay view) and 20261014130000 (payroll_error, helpers, lock order). The
-- paid_pay_run clock lock is 20261014150100. Business time is America/Toronto.
--
-- CONTRACT (as 20261014130000: SECURITY DEFINER, search_path '', admin only with not_admin first,
-- lock order employees row then the period's pay_runs rows via private.lock_pay_period)
--
--   * A paid run never goes back to unpaid: no function sets status away from 'paid'.
--   * Paid-on rules, for Mark paid and payout edits alike: paid_on_required (null),
--     paid_on_future (after the Toronto Business date), paid_on_before_period_end (before the
--     last day of the run's Pay period). The method is stored trimmed: method_required when blank.
--   * Blocked at Mark paid: a claimed, payable session that is no longer closed (Open shift, or a
--     Missing clock once its clocks are cleared) or has no Pay rate. A session still before its
--     grace counts with its kind: in progress as an Open shift, upcoming as a Missing clock.
--   * Released at Mark paid: claims on a Removed session or a cancelled or archived appointment.
--     They never show as paid and become ordinary unclaimed sessions.
--   * Frozen at Mark paid: each remaining claim gets the pay view's live scheduled_date,
--     client_name, job_name, clocked minutes, effective rate and amount, in the same transaction
--     that sets the run paid. From then on the pay view reports those values.
--
-- FUNCTIONS
--
--   mark_pay_runs_paid(items jsonb, paid_on date) -> setof (pay_run_id, code, message, detail).
--     items is [{ run_id, payout_method }]. One row per item: code 'ok', or the refusal code and
--     message (blocked: detail { open_shift, missing_clock, no_rate } counts). A refusal rolls back
--     only its own item. Refusals, in order: run_not_found, not_finalized (a draft or already paid),
--     method_required, the paid-on rules, blocked. $0 and negative runs are paid like any other.
--     Items are taken in (employee_id, period_start, run id) order, so bulk calls can't deadlock.
--   update_pay_run_payout(run_id, payout_method, paid_on). Refusals: run_not_found, not_paid,
--     method_required, the paid-on rules.
--
-- payroll_error is replaced to add method_required, paid_on_required, paid_on_future,
-- paid_on_before_period_end and not_paid, and to reword not_finalized for Mark paid. Its CASE
-- block stays the only WHEN '...' THEN in its body; src/lib/payroll/errors.ts mirrors this, the
-- newest definition, and tests/payroll/errors.test.ts reads it.
--
-- DOWN. Drops functions only; paid runs and frozen lines stay paid.
--
--   DROP FUNCTION "public"."update_pay_run_payout"("uuid", "text", "date");
--   DROP FUNCTION "public"."mark_pay_runs_paid"("jsonb", "date");
--   DROP FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "date");
--   DROP FUNCTION "private"."check_payout"("public"."pay_runs", "text", "date");
--   then re-run section 1 of 20261014130000 (payroll_error) with CREATE OR REPLACE.


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


-- 2. Helpers -------------------------------------------------------------------------------------

CREATE FUNCTION "private"."check_payout"("p_run" "public"."pay_runs", "p_payout_method" "text", "p_paid_on" "date")
    RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	IF coalesce(btrim(p_payout_method), '') = '' THEN
		PERFORM public.payroll_error('method_required');
	END IF;
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

ALTER FUNCTION "private"."check_payout"("public"."pay_runs", "text", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."check_payout"("public"."pay_runs", "text", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."check_payout"("public"."pay_runs", "text", "date") IS 'Refuses a Payout method blank after trimming (method_required) and a paid date that is missing, after the Toronto Business date or before the run''s Pay period end.';


CREATE FUNCTION "private"."mark_pay_run_paid"("p_run_id" "uuid", "p_payout_method" "text", "p_paid_on" "date")
    RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	run public.pay_runs;
	counts record;
	unfrozen_count integer;
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

	PERFORM private.check_payout(run, p_payout_method, p_paid_on);

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

	UPDATE public.pay_runs
	SET status = 'paid', paid_on = p_paid_on, payout_method = btrim(p_payout_method), paid_at = now()
	WHERE pay_runs.id = run.id;
END;
$$;

ALTER FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."mark_pay_run_paid"("uuid", "text", "date") IS 'Marks one finalized Pay run paid: releases claims that no longer pay, freezes every remaining line and records the payout, raising payroll_error on a refusal. Called per item by mark_pay_runs_paid.';


-- 3. mark_pay_runs_paid --------------------------------------------------------------------------

CREATE FUNCTION "public"."mark_pay_runs_paid"("p_items" "jsonb", "p_paid_on" "date")
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
			PERFORM private.mark_pay_run_paid(item.run_id, item.payout_method, p_paid_on);
		EXCEPTION WHEN sqlstate 'P0001' THEN
			GET STACKED DIAGNOSTICS code = PG_EXCEPTION_DETAIL, message = MESSAGE_TEXT, refusal_hint = PG_EXCEPTION_HINT;
			detail := nullif(refusal_hint, '')::jsonb;
		END;

		RETURN NEXT;
	END LOOP;
END;
$$;

ALTER FUNCTION "public"."mark_pay_runs_paid"("jsonb", "date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."mark_pay_runs_paid"("jsonb", "date") IS 'Marks each item''s (run_id, payout_method) finalized Pay run paid on paid_on, freezing its lines. One row per item: code ok, or the refusal code, message and detail (blocked: counts per kind). Admin only.';


-- 4. update_pay_run_payout -----------------------------------------------------------------------

CREATE FUNCTION "public"."update_pay_run_payout"("p_run_id" "uuid", "p_payout_method" "text", "p_paid_on" "date")
    RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	run public.pay_runs;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

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

	PERFORM private.check_payout(run, p_payout_method, p_paid_on);

	UPDATE public.pay_runs
	SET payout_method = btrim(p_payout_method), paid_on = p_paid_on
	WHERE pay_runs.id = run.id;
END;
$$;

ALTER FUNCTION "public"."update_pay_run_payout"("uuid", "text", "date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."update_pay_run_payout"("uuid", "text", "date") IS 'Edits a paid Pay run''s Payout method and paid date, with the Mark paid rules. The run stays paid. Admin only.';
