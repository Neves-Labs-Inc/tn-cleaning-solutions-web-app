-- The paid_pay_run clock lock: a Clock correction on a session claimed by a paid Pay run is refused.
--
-- .scratch/payroll-v2/spec.md and ticket 03; CONTEXT.md "Clock correction". Replaces clock_error
-- and correct_session_clocks from 20261010120000 (its contract still holds) to fill in the
-- "Payroll: refuse here" step: after the Cleaner's employees row is locked (step 4) and before any
-- clock validation, correct_session_clocks refuses paid_pay_run when the session has a claim on a
-- paid run (20261014233000 freezes those amounts). The lock is per session, never per visit, and
-- a finalized but unpaid run's clocks stay editable. A clear (both clocks null) is refused too.
--
-- clock_error's CASE block stays the only WHEN '...' THEN in its body; src/lib/time-sheets/errors.ts
-- mirrors this, the newest definition, and tests/time-sheets/errors.test.ts reads it.
--
-- DOWN. Re-run sections 5 and 7 of 20261010120000 with CREATE OR REPLACE.


-- 1. clock_error ---------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."clock_error"("code" "text", "hint" "text" DEFAULT NULL) RETURNS "void"
    LANGUAGE "plpgsql"
    -- VOLATILE (the default) on purpose: a constant-folded call would raise at plan time.
    SET "search_path" TO ''
    AS $$
DECLARE
	error_message text;
BEGIN
	error_message := CASE code
		WHEN 'not_admin' THEN 'Only an admin can change clocks.'
		WHEN 'session_not_found' THEN 'This session no longer exists.'
		WHEN 'session_archived' THEN 'This Cleaner is no longer on the crew.'
		WHEN 'visit_cancelled' THEN 'This visit is cancelled.'
		WHEN 'clock_in_required' THEN 'A clock-out needs a clock-in.'
		WHEN 'clock_in_future' THEN 'Clock-in can''t be in the future.'
		WHEN 'clock_out_future' THEN 'Clock-out can''t be in the future.'
		WHEN 'clock_out_before_clock_in' THEN 'Clock-out must be after clock-in.'
		WHEN 'clock_out_required' THEN 'This visit ended more than an hour ago; enter a clock-out.'
		WHEN 'overlap' THEN 'These clocks overlap another session of this Cleaner.'
		WHEN 'session_open' THEN 'Only a closed session can be acknowledged.'
		WHEN 'clocks_changed' THEN 'The clocks changed since they were read.'
		WHEN 'note_required' THEN 'An acknowledgement needs a note.'
		WHEN 'paid_pay_run' THEN 'This shift is on a paid Pay run; its clocks are locked.'
	END;

	-- A typo in a caller's code must fail loudly, not raise a blank message.
	IF error_message IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = 'Unknown clock error: ' || coalesce(code, 'null'),
			DETAIL = 'unknown_clock_error', ERRCODE = 'P0001';
	END IF;

	-- RAISE refuses a null option, so the hint is only attached when there is one.
	IF hint IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = error_message, DETAIL = code, ERRCODE = 'P0001';
	END IF;
	RAISE EXCEPTION USING MESSAGE = error_message, DETAIL = code, HINT = hint, ERRCODE = 'P0001';
END;
$$;

ALTER FUNCTION "public"."clock_error"("code" "text", "hint" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."clock_error"("code" "text", "hint" "text") IS 'Raises a clock refusal: MESSAGE is readable, DETAIL is the code, HINT the optional hint (overlap: the clashing assignment id). The CASE block is the code list src/lib/time-sheets/errors.ts mirrors.';



-- 2. correct_session_clocks ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."correct_session_clocks"("assignment_id" "uuid", "new_clock_in" timestamp with time zone,
    "new_clock_out" timestamp with time zone, "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	locked record;
	session public.appointment_employees;
	visit public.appointments;
	visit_ends_at timestamptz;
	clashing_id uuid;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.clock_error('not_admin');
	END IF;

	locked := private.lock_clock_session(correct_session_clocks.assignment_id);
	session := locked.session;
	visit := locked.visit;

	-- Serializes overlap checks for one Cleaner: two corrections can't both pass and then clash.
	PERFORM 1 FROM public.employees WHERE employees.id = session.employee_id FOR UPDATE;

	-- Paid amounts are frozen, so the clocks behind them are too. Per session: a crewmate's unpaid
	-- session on the same visit stays editable. Checked under the Cleaner's lock, which Mark paid
	-- also takes first, so a correction can't slip in while her run is being paid.
	IF EXISTS (
		SELECT 1
		FROM public.pay_run_lines
		JOIN public.pay_runs ON pay_runs.id = pay_run_lines.pay_run_id
		WHERE pay_run_lines.appointment_employee_id = session.id
			AND pay_runs.status = 'paid'
	) THEN
		PERFORM public.clock_error('paid_pay_run');
	END IF;

	IF correct_session_clocks.new_clock_in IS NOT NULL OR correct_session_clocks.new_clock_out IS NOT NULL THEN
		visit_ends_at := (visit.scheduled_date + visit.scheduled_end_time) AT TIME ZONE 'America/Toronto';

		IF correct_session_clocks.new_clock_in IS NULL THEN
			PERFORM public.clock_error('clock_in_required');
		END IF;
		IF correct_session_clocks.new_clock_in > now() THEN
			PERFORM public.clock_error('clock_in_future');
		END IF;
		IF correct_session_clocks.new_clock_out > now() THEN
			PERFORM public.clock_error('clock_out_future');
		END IF;
		IF correct_session_clocks.new_clock_out <= correct_session_clocks.new_clock_in THEN
			PERFORM public.clock_error('clock_out_before_clock_in');
		END IF;
		-- Entering a clock-in alone for someone who never clocked would open a shift long over.
		IF session.clocked_in_at IS NULL
			AND correct_session_clocks.new_clock_out IS NULL
			AND now() > visit_ends_at + interval '1 hour' THEN
			PERFORM public.clock_error('clock_out_required');
		END IF;

		-- Open shifts are ignored: their end isn't known yet. Touching intervals don't clash.
		SELECT other.id INTO clashing_id
		FROM public.appointment_employees AS other
		JOIN public.appointments AS other_visit ON other_visit.id = other.appointment_id
		WHERE other.employee_id = session.employee_id
			AND other.id <> session.id
			AND other.clocked_in_at IS NOT NULL
			AND other.clocked_out_at IS NOT NULL
			AND NOT coalesce(other.is_archived, false)
			AND NOT coalesce(other_visit.is_archived, false)
			AND other_visit.status <> 'cancelled'
			AND other.clocked_in_at < coalesce(correct_session_clocks.new_clock_out, now())
			AND correct_session_clocks.new_clock_in < other.clocked_out_at
		ORDER BY other.clocked_in_at
		LIMIT 1;

		IF clashing_id IS NOT NULL THEN
			PERFORM public.clock_error('overlap', clashing_id::text);
		END IF;
	END IF;

	IF session.clocked_in_at IS NOT DISTINCT FROM correct_session_clocks.new_clock_in
		AND session.clocked_out_at IS NOT DISTINCT FROM correct_session_clocks.new_clock_out THEN
		RETURN;
	END IF;

	-- One UPDATE, so the status trigger derives once from both new clocks.
	UPDATE public.appointment_employees
	SET clocked_in_at = correct_session_clocks.new_clock_in,
		clocked_out_at = correct_session_clocks.new_clock_out
	WHERE appointment_employees.id = session.id;

	INSERT INTO public.clock_corrections (
		appointment_employee_id, corrected_by, corrected_by_name,
		old_clock_in, old_clock_out, new_clock_in, new_clock_out, reason
	) VALUES (
		session.id,
		auth.uid(),
		coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), auth.jwt() ->> 'email'),
		session.clocked_in_at,
		session.clocked_out_at,
		correct_session_clocks.new_clock_in,
		correct_session_clocks.new_clock_out,
		nullif(btrim(correct_session_clocks.reason), '')
	);
END;
$$;

ALTER FUNCTION "public"."correct_session_clocks"("uuid", timestamp with time zone, timestamp with time zone, "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."correct_session_clocks"("uuid", timestamp with time zone, timestamp with time zone, "text") IS 'The one write path for an admin clock change (a Clock correction): validates, refuses overlaps with the Cleaner''s other closed sessions, writes both clocks and appends a clock_corrections row in one transaction. Both clocks null clears the session. A call that changes nothing writes nothing. Admin only; refusals go through clock_error.';

