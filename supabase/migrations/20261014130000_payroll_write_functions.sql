-- Payroll writes: Finalize, Undo finalize, Adjustments, Add Cleaner and Off-cycle runs.
--
-- .scratch/payroll-v2/spec.md and ticket 02; CONTEXT.md "Pay run", "Adjustment", "Off-cycle run";
-- ADR docs/adr/0001-invoice-writes-in-sql-functions-and-status-trigger.md. Tables and the pay view
-- are 20261014120000. Business time is America/Toronto.
--
-- DEFINITIONS, for Cleaner C and Pay period P (computed from pay_period_sessions):
--
--   * Draft lines: C's unclaimed sessions in P that are closed and payable (visit not cancelled).
--   * Problem sessions: C's unclaimed, payable sessions in P that are an Open shift or a Missing
--     clock. Blockers = problem sessions + draft lines with no Pay rate. Odd duration never blocks.
--   * Current draft: the regular run while it isn't finalized (stored or not). Once the regular run
--     is finalized or paid, the off-cycle draft if one was started; otherwise there is none.
--   * Stragglers: C's draft lines in an ended P whose regular run is finalized or paid.
--   * Current run (Adjustments): C's unpaid off-cycle run in P, else her regular run.
--
-- CONTRACT (every function)
--
--   * SECURITY DEFINER, search_path '', owner postgres, one transaction. The first thing each does
--     is refuse a caller who isn't an admin with payroll_error('not_admin'). EXECUTE stays granted
--     (revoking it crashes the PG 17.6 image, see 20260917120000).
--   * Lock order: C's employees row FOR UPDATE, then all her pay_runs rows in P FOR UPDATE
--     (private.lock_pay_period). Two finalizes for one Cleaner queue, so a claim race can't pay a
--     shift twice (pay_run_lines.appointment_employee_id is also UNIQUE). finalize_pay_runs takes
--     its targets in (employee_id, period_start) order, so two bulk calls can't deadlock.
--   * A period_start is taken as the Pay period that contains it. Period checks, where they apply,
--     come first: before_payroll_start, then period_not_ended (Toronto Business date <= period end).
--   * payroll_error(code, hint): the one place every refusal is raised. MESSAGE = readable text,
--     DETAIL = code, HINT = the optional hint, ERRCODE P0001. Its CASE block is the code list
--     src/lib/payroll/errors.ts mirrors; keep it the only WHEN '...' THEN in this file so the drift
--     test can read it.
--
-- FUNCTIONS
--
--   finalize_pay_runs(targets jsonb) -> setof (employee_id, period_start, code, message, detail,
--     pay_run_id). targets is [{ employee_id, period_start }]. One row per target: code 'ok' with
--     the finalized run's id, or the refusal code and message. A refusal rolls back only its own
--     target. Refusals: before_payroll_start, period_not_ended, nothing_to_finalize (no current
--     draft), blocked (detail { open_shift, missing_clock, no_rate } counts). On success the
--     current draft's row is inserted if none is stored, set finalized with finalized_at, and every
--     draft line is claimed. $0 and negative totals finalize.
--   undo_finalize_pay_run(run_id). finalized -> draft: its claims are deleted, its Adjustments
--     kept. Refusals: run_not_found, not_finalized (draft or paid), has_later_run (a regular run
--     whose Cleaner has an off-cycle run in P).
--   add_pay_adjustment(employee_id, period_start, amount_cents, reason, appointment_employee_id)
--     -> uuid. Adds to C's current run, creating the regular draft row when C has no stored run.
--     Refusals: before_payroll_start, period_not_ended, amount_required (0 or null),
--     reason_required (blank after trim), run_paid (no unpaid run), appointment_not_on_run (the
--     session is neither claimed by the run nor, on a draft, one of its draft lines). The reason is
--     stored trimmed.
--   delete_pay_adjustment(adjustment_id). Refusals: adjustment_not_found, run_paid.
--   add_cleaner_to_pay_period(employee_id, period_start) -> uuid: a stored regular draft, so an
--     Adjustment-only run can exist. Refusals: before_payroll_start, period_not_ended,
--     already_in_period (C has any run in P, a draft line or a problem session).
--   remove_cleaner_from_pay_period(employee_id, period_start): deletes C's stored regular draft.
--     Refusals: run_not_found (no stored regular draft), run_not_empty (it has Adjustments, a draft
--     line or a problem session).
--   start_off_cycle_run(employee_id, period_start) -> uuid: an off_cycle draft whose lines are the
--     stragglers. Refusals: before_payroll_start, period_not_ended, draft_exists (an unpaid
--     off-cycle run, draft or finalized: one per period at a time), no_stragglers (none, which
--     includes a regular run that isn't finalized or paid).
--
-- HELPERS, in the private schema (not exposed through PostgREST, see 20261004120000):
-- private.payroll_period (normalize + period checks), private.lock_pay_period (lock order),
-- private.count_pay_period_sessions (draft lines and blockers) and private.finalize_pay_run (one
-- target, raising).
--
-- DOWN. Drops functions only; runs, claims and Adjustments they wrote stay.
--
--   DROP FUNCTION "public"."start_off_cycle_run"("uuid", "date");
--   DROP FUNCTION "public"."remove_cleaner_from_pay_period"("uuid", "date");
--   DROP FUNCTION "public"."add_cleaner_to_pay_period"("uuid", "date");
--   DROP FUNCTION "public"."delete_pay_adjustment"("uuid");
--   DROP FUNCTION "public"."add_pay_adjustment"("uuid", "date", integer, "text", "uuid");
--   DROP FUNCTION "public"."undo_finalize_pay_run"("uuid");
--   DROP FUNCTION "public"."finalize_pay_runs"("jsonb");
--   DROP FUNCTION "private"."finalize_pay_run"("uuid", "date");
--   DROP FUNCTION "private"."count_pay_period_sessions"("uuid", "date");
--   DROP FUNCTION "private"."lock_pay_period"("uuid", "date");
--   DROP FUNCTION "private"."payroll_period"("date");
--   DROP FUNCTION "public"."payroll_error"("text", "text");


-- 1. payroll_error -------------------------------------------------------------------------------

CREATE FUNCTION "public"."payroll_error"("code" "text", "hint" "text" DEFAULT NULL) RETURNS "void"
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
		WHEN 'not_finalized' THEN 'Only a finalized, unpaid Pay run can go back to draft.'
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

ALTER FUNCTION "public"."payroll_error"("code" "text", "hint" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."payroll_error"("code" "text", "hint" "text") IS 'Raises a Payroll refusal: MESSAGE is readable, DETAIL is the code, HINT the optional hint (blocked: the counts as JSON). The CASE block is the code list src/lib/payroll/errors.ts mirrors.';


-- 2. Helpers -------------------------------------------------------------------------------------

CREATE FUNCTION "private"."payroll_period"("p_period_start" "date") RETURNS "date"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	period_start date := public.pay_period_start(p_period_start);
BEGIN
	IF period_start < (public.payroll_settings()).payroll_start THEN
		PERFORM public.payroll_error('before_payroll_start');
	END IF;
	IF NOT public.pay_period_has_ended(period_start) THEN
		PERFORM public.payroll_error('period_not_ended');
	END IF;
	RETURN period_start;
END;
$$;

ALTER FUNCTION "private"."payroll_period"("date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."payroll_period"("date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."payroll_period"("date") IS 'The start of the Pay period containing the date, refusing before_payroll_start and period_not_ended.';


CREATE FUNCTION "private"."lock_pay_period"("p_employee_id" "uuid", "p_period_start" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	-- The Cleaner first, then her runs: every Payroll write for her queues on the first lock.
	PERFORM 1 FROM public.employees WHERE employees.id = p_employee_id FOR UPDATE;

	PERFORM 1
	FROM public.pay_runs
	WHERE pay_runs.employee_id = p_employee_id AND pay_runs.period_start = p_period_start
	ORDER BY pay_runs.id
	FOR UPDATE;
END;
$$;

ALTER FUNCTION "private"."lock_pay_period"("uuid", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."lock_pay_period"("uuid", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."lock_pay_period"("uuid", "date") IS 'The Payroll lock order: the Cleaner''s employees row, then her pay_runs rows in the period, all FOR UPDATE.';


-- Reads the pay view, so lines and blockers follow exactly the rules the admin screens show. Only
-- payable rows count: the view also flags cancelled sessions.
CREATE FUNCTION "private"."count_pay_period_sessions"("p_employee_id" "uuid", "p_period_start" "date",
    OUT "line_count" integer, OUT "open_shift" integer, OUT "missing_clock" integer, OUT "no_rate" integer)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
	SELECT
		count(*) FILTER (WHERE sessions.state = 'closed')::integer,
		count(*) FILTER (WHERE sessions.is_open_shift)::integer,
		count(*) FILTER (WHERE sessions.is_missing_clock)::integer,
		count(*) FILTER (WHERE sessions.state = 'closed' AND sessions.has_no_rate)::integer
	FROM public.pay_period_sessions AS sessions
	WHERE sessions.employee_id = p_employee_id
		AND sessions.period_start = p_period_start
		AND sessions.pay_run_id IS NULL
		AND sessions.is_payable;
$$;

ALTER FUNCTION "private"."count_pay_period_sessions"("uuid", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."count_pay_period_sessions"("uuid", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."count_pay_period_sessions"("uuid", "date") IS 'A Cleaner''s unclaimed, payable sessions in a period: draft lines (closed), Open shifts, Missing clocks and draft lines with no Pay rate.';


CREATE FUNCTION "private"."finalize_pay_run"("p_employee_id" "uuid", "p_period_start" "date") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	run_period date := private.payroll_period(p_period_start);
	regular_run public.pay_runs;
	draft_run public.pay_runs;
	counts record;
BEGIN
	PERFORM private.lock_pay_period(p_employee_id, run_period);

	SELECT * INTO regular_run
	FROM public.pay_runs
	WHERE pay_runs.employee_id = p_employee_id
		AND pay_runs.period_start = run_period
		AND pay_runs.kind = 'regular';

	IF regular_run.id IS NULL OR regular_run.status = 'draft' THEN
		draft_run := regular_run;
	ELSE
		SELECT * INTO draft_run
		FROM public.pay_runs
		WHERE pay_runs.employee_id = p_employee_id
			AND pay_runs.period_start = run_period
			AND pay_runs.kind = 'off_cycle'
			AND pay_runs.status = 'draft';

		IF draft_run.id IS NULL THEN
			PERFORM public.payroll_error('nothing_to_finalize');
		END IF;
	END IF;

	counts := private.count_pay_period_sessions(p_employee_id, run_period);

	-- An unstored regular draft exists only while it has a line or a problem session.
	IF draft_run.id IS NULL AND counts.line_count + counts.open_shift + counts.missing_clock = 0 THEN
		PERFORM public.payroll_error('nothing_to_finalize');
	END IF;

	IF counts.open_shift + counts.missing_clock + counts.no_rate > 0 THEN
		PERFORM public.payroll_error('blocked', jsonb_build_object(
			'open_shift', counts.open_shift, 'missing_clock', counts.missing_clock, 'no_rate', counts.no_rate
		)::text);
	END IF;

	IF draft_run.id IS NULL THEN
		INSERT INTO public.pay_runs (employee_id, period_start, kind, created_by)
		VALUES (p_employee_id, run_period, 'regular', auth.uid())
		RETURNING * INTO draft_run;
	END IF;

	UPDATE public.pay_runs
	SET status = 'finalized', finalized_at = now()
	WHERE pay_runs.id = draft_run.id;

	INSERT INTO public.pay_run_lines (pay_run_id, appointment_employee_id)
	SELECT draft_run.id, sessions.appointment_employee_id
	FROM public.pay_period_sessions AS sessions
	WHERE sessions.employee_id = p_employee_id
		AND sessions.period_start = run_period
		AND sessions.pay_run_id IS NULL
		AND sessions.is_payable
		AND sessions.state = 'closed';

	RETURN draft_run.id;
END;
$$;

ALTER FUNCTION "private"."finalize_pay_run"("uuid", "date") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."finalize_pay_run"("uuid", "date") FROM PUBLIC;

COMMENT ON FUNCTION "private"."finalize_pay_run"("uuid", "date") IS 'Finalizes one Cleaner''s current draft in a period and claims its draft lines, raising payroll_error on a refusal. Called per target by finalize_pay_runs.';


-- 3. finalize_pay_runs ---------------------------------------------------------------------------

CREATE FUNCTION "public"."finalize_pay_runs"("p_targets" "jsonb")
    RETURNS TABLE ("employee_id" "uuid", "period_start" "date", "code" "text", "message" "text", "detail" "jsonb", "pay_run_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	target record;
	refusal_hint text;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	-- Sorted, so concurrent bulk calls take the Cleaners' locks in one order.
	FOR target IN
		SELECT (item ->> 'employee_id')::uuid AS target_employee_id, (item ->> 'period_start')::date AS target_period_start
		FROM jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) AS item
		ORDER BY 1, 2
	LOOP
		employee_id := target.target_employee_id;
		period_start := target.target_period_start;
		code := 'ok';
		message := NULL;
		detail := NULL;
		pay_run_id := NULL;

		-- The block is a savepoint: a refused target undoes only its own writes.
		BEGIN
			pay_run_id := private.finalize_pay_run(target.target_employee_id, target.target_period_start);
		EXCEPTION WHEN sqlstate 'P0001' THEN
			GET STACKED DIAGNOSTICS code = PG_EXCEPTION_DETAIL, message = MESSAGE_TEXT, refusal_hint = PG_EXCEPTION_HINT;
			detail := nullif(refusal_hint, '')::jsonb;
		END;

		RETURN NEXT;
	END LOOP;
END;
$$;

ALTER FUNCTION "public"."finalize_pay_runs"("jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."finalize_pay_runs"("jsonb") IS 'Finalizes each target''s (employee_id, period_start) current draft and claims its lines. One row per target: code ok with the run id, or the refusal code, message and detail (blocked: counts per kind). Admin only.';


-- 4. undo_finalize_pay_run -----------------------------------------------------------------------

CREATE FUNCTION "public"."undo_finalize_pay_run"("p_run_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	run public.pay_runs;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

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

	-- The off-cycle run's lines exist because this one was finalized; reopening it would mix them.
	IF run.kind = 'regular' AND EXISTS (
		SELECT 1 FROM public.pay_runs AS later
		WHERE later.employee_id = run.employee_id
			AND later.period_start = run.period_start
			AND later.kind = 'off_cycle'
	) THEN
		PERFORM public.payroll_error('has_later_run');
	END IF;

	DELETE FROM public.pay_run_lines WHERE pay_run_lines.pay_run_id = run.id;

	UPDATE public.pay_runs
	SET status = 'draft', finalized_at = NULL
	WHERE pay_runs.id = run.id;
END;
$$;

ALTER FUNCTION "public"."undo_finalize_pay_run"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."undo_finalize_pay_run"("uuid") IS 'Returns a finalized, unpaid Pay run to draft: deletes its claims, keeps its Adjustments. Refuses a regular run whose Cleaner has an off-cycle run in the period. Admin only.';


-- 5. Adjustments ---------------------------------------------------------------------------------

CREATE FUNCTION "public"."add_pay_adjustment"("p_employee_id" "uuid", "p_period_start" "date", "p_amount_cents" integer,
    "p_reason" "text", "p_appointment_employee_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	run_period date;
	run public.pay_runs;
	adjustment_id uuid;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	run_period := private.payroll_period(p_period_start);

	IF coalesce(p_amount_cents, 0) = 0 THEN
		PERFORM public.payroll_error('amount_required');
	END IF;
	IF coalesce(btrim(p_reason), '') = '' THEN
		PERFORM public.payroll_error('reason_required');
	END IF;

	PERFORM private.lock_pay_period(p_employee_id, run_period);

	-- The current run: an unpaid off-cycle run when there is one, else the unpaid regular run.
	SELECT * INTO run
	FROM public.pay_runs
	WHERE pay_runs.employee_id = p_employee_id
		AND pay_runs.period_start = run_period
		AND pay_runs.status <> 'paid'
	ORDER BY pay_runs.kind = 'off_cycle' DESC
	LIMIT 1;

	IF run.id IS NULL THEN
		IF EXISTS (
			SELECT 1 FROM public.pay_runs
			WHERE pay_runs.employee_id = p_employee_id
				AND pay_runs.period_start = run_period
		) THEN
			PERFORM public.payroll_error('run_paid');
		END IF;

		INSERT INTO public.pay_runs (employee_id, period_start, kind, created_by)
		VALUES (p_employee_id, run_period, 'regular', auth.uid())
		RETURNING * INTO run;
	END IF;

	-- A run's lines are its claims; a draft's are also the draft lines it would claim.
	IF p_appointment_employee_id IS NOT NULL AND NOT (
		EXISTS (
			SELECT 1 FROM public.pay_run_lines
			WHERE pay_run_lines.pay_run_id = run.id
				AND pay_run_lines.appointment_employee_id = p_appointment_employee_id
		)
		OR (run.status = 'draft' AND EXISTS (
			SELECT 1 FROM public.pay_period_sessions AS sessions
			WHERE sessions.appointment_employee_id = p_appointment_employee_id
				AND sessions.employee_id = p_employee_id
				AND sessions.period_start = run_period
				AND sessions.pay_run_id IS NULL
				AND sessions.is_payable
				AND sessions.state = 'closed'
		))
	) THEN
		PERFORM public.payroll_error('appointment_not_on_run');
	END IF;

	INSERT INTO public.pay_adjustments (pay_run_id, amount_cents, reason, appointment_employee_id, created_by)
	VALUES (run.id, p_amount_cents, btrim(p_reason), p_appointment_employee_id, auth.uid())
	RETURNING id INTO adjustment_id;

	RETURN adjustment_id;
END;
$$;

ALTER FUNCTION "public"."add_pay_adjustment"("uuid", "date", integer, "text", "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."add_pay_adjustment"("uuid", "date", integer, "text", "uuid") IS 'Adds an Adjustment to a Cleaner''s current unpaid run in an ended period (an unpaid off-cycle run first, else the regular run, created as a draft when none is stored), optionally pointing at one of its lines. Returns the new id. Admin only.';


CREATE FUNCTION "public"."delete_pay_adjustment"("p_adjustment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	run public.pay_runs;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	SELECT run_row.* INTO run
	FROM public.pay_adjustments
	JOIN public.pay_runs AS run_row ON run_row.id = pay_adjustments.pay_run_id
	WHERE pay_adjustments.id = p_adjustment_id;

	IF run.id IS NULL THEN
		PERFORM public.payroll_error('adjustment_not_found');
	END IF;

	PERFORM private.lock_pay_period(run.employee_id, run.period_start);

	-- Read again under the lock: the run may have been paid meanwhile.
	SELECT run_row.* INTO run
	FROM public.pay_adjustments
	JOIN public.pay_runs AS run_row ON run_row.id = pay_adjustments.pay_run_id
	WHERE pay_adjustments.id = p_adjustment_id;

	IF run.id IS NULL THEN
		PERFORM public.payroll_error('adjustment_not_found');
	END IF;
	IF run.status = 'paid' THEN
		PERFORM public.payroll_error('run_paid');
	END IF;

	DELETE FROM public.pay_adjustments WHERE pay_adjustments.id = p_adjustment_id;
END;
$$;

ALTER FUNCTION "public"."delete_pay_adjustment"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."delete_pay_adjustment"("uuid") IS 'Deletes an Adjustment from an unpaid Pay run. Admin only.';


-- 6. Add Cleaner and remove ----------------------------------------------------------------------

CREATE FUNCTION "public"."add_cleaner_to_pay_period"("p_employee_id" "uuid", "p_period_start" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	run_period date;
	counts record;
	run_id uuid;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	run_period := private.payroll_period(p_period_start);

	PERFORM private.lock_pay_period(p_employee_id, run_period);

	counts := private.count_pay_period_sessions(p_employee_id, run_period);

	IF counts.line_count + counts.open_shift + counts.missing_clock > 0 OR EXISTS (
		SELECT 1 FROM public.pay_runs
		WHERE pay_runs.employee_id = p_employee_id
			AND pay_runs.period_start = run_period
	) THEN
		PERFORM public.payroll_error('already_in_period');
	END IF;

	INSERT INTO public.pay_runs (employee_id, period_start, kind, created_by)
	VALUES (p_employee_id, run_period, 'regular', auth.uid())
	RETURNING id INTO run_id;

	RETURN run_id;
END;
$$;

ALTER FUNCTION "public"."add_cleaner_to_pay_period"("uuid", "date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."add_cleaner_to_pay_period"("uuid", "date") IS 'Stores an empty regular draft for a Cleaner with no run in an ended period, so she can get an Adjustment-only run. Returns its id. Admin only.';


CREATE FUNCTION "public"."remove_cleaner_from_pay_period"("p_employee_id" "uuid", "p_period_start" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	run_period date;
	run_id uuid;
	counts record;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	-- No period checks: a stored draft only exists in an ended period from the Payroll start on.
	run_period := public.pay_period_start(p_period_start);

	PERFORM private.lock_pay_period(p_employee_id, run_period);

	SELECT pay_runs.id INTO run_id
	FROM public.pay_runs
	WHERE pay_runs.employee_id = p_employee_id
		AND pay_runs.period_start = run_period
		AND pay_runs.kind = 'regular'
		AND pay_runs.status = 'draft';

	IF run_id IS NULL THEN
		PERFORM public.payroll_error('run_not_found');
	END IF;

	counts := private.count_pay_period_sessions(p_employee_id, run_period);

	IF counts.line_count + counts.open_shift + counts.missing_clock > 0
		OR EXISTS (SELECT 1 FROM public.pay_adjustments WHERE pay_adjustments.pay_run_id = run_id) THEN
		PERFORM public.payroll_error('run_not_empty');
	END IF;

	DELETE FROM public.pay_runs WHERE pay_runs.id = run_id;
END;
$$;

ALTER FUNCTION "public"."remove_cleaner_from_pay_period"("uuid", "date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."remove_cleaner_from_pay_period"("uuid", "date") IS 'Deletes a Cleaner''s stored regular draft in a period when it has no lines, Adjustments or problem sessions (undoes a mistaken Add Cleaner). Admin only.';


-- 7. start_off_cycle_run -------------------------------------------------------------------------

CREATE FUNCTION "public"."start_off_cycle_run"("p_employee_id" "uuid", "p_period_start" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	run_period date;
	counts record;
	run_id uuid;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.payroll_error('not_admin');
	END IF;

	run_period := private.payroll_period(p_period_start);

	PERFORM private.lock_pay_period(p_employee_id, run_period);

	IF EXISTS (
		SELECT 1 FROM public.pay_runs
		WHERE pay_runs.employee_id = p_employee_id
			AND pay_runs.period_start = run_period
			AND pay_runs.kind = 'off_cycle'
			AND pay_runs.status <> 'paid'
	) THEN
		PERFORM public.payroll_error('draft_exists');
	END IF;

	-- Unclaimed shifts are stragglers only once the regular run is finalized or paid.
	counts := private.count_pay_period_sessions(p_employee_id, run_period);

	IF counts.line_count = 0 OR NOT EXISTS (
		SELECT 1 FROM public.pay_runs
		WHERE pay_runs.employee_id = p_employee_id
			AND pay_runs.period_start = run_period
			AND pay_runs.kind = 'regular'
			AND pay_runs.status IN ('finalized', 'paid')
	) THEN
		PERFORM public.payroll_error('no_stragglers');
	END IF;

	INSERT INTO public.pay_runs (employee_id, period_start, kind, created_by)
	VALUES (p_employee_id, run_period, 'off_cycle', auth.uid())
	RETURNING id INTO run_id;

	RETURN run_id;
END;
$$;

ALTER FUNCTION "public"."start_off_cycle_run"("uuid", "date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."start_off_cycle_run"("uuid", "date") IS 'Starts a Cleaner''s off-cycle draft in an ended period whose regular run is finalized or paid and that has stragglers. Returns its id. Admin only.';
