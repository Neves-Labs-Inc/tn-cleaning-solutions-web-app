-- Clock corrections and Odd duration acknowledgements: one audited, atomic write path for every
-- admin clock change.
--
-- Ontario ESA and CRA rules require a correction to keep the original values (who, when, old, new,
-- why) for 6 years. ADR docs/adr/0001-invoice-writes-in-sql-functions-and-status-trigger.md;
-- CONTEXT.md "Clock correction", "Odd duration"; .scratch/admin-timesheets ticket 01. One session
-- is one appointment_employees row. Business time is America/Toronto.
--
-- CONTRACT
--
--   * clock_corrections: append-only. One row per correct_session_clocks call that changed a clock,
--     with the admin (auth.uid()), a snapshot of their name (JWT user_metadata.full_name, else
--     email), the old and new clocks, and the trimmed reason (null when blank).
--   * odd_duration_acknowledgements: append-only. One row per acknowledge_odd_duration call, with a
--     snapshot of the clocks it was given for and a non-blank note.
--   * Both: FK to appointment_employees ON DELETE RESTRICT, so a session with a record can't be
--     deleted (archive it instead). RLS on with an admin-only SELECT policy and no write policy;
--     anon has no privilege and authenticated has SELECT only. A BEFORE UPDATE OR DELETE trigger
--     raises, so no role (service_role and postgres included) can change or remove a row.
--   * clock_error(code, hint): the one place every clock refusal is raised, MESSAGE = readable text,
--     DETAIL = code, HINT = the optional hint (overlap: the clashing assignment id), ERRCODE P0001.
--     Its CASE block is the code list src/lib/time-sheets/errors.ts mirrors; keep it the only
--     WHEN '...' THEN in this file so the drift test can read it.
--
-- FUNCTIONS (SECURITY DEFINER, search_path '', owner postgres, one transaction)
--
--   correct_session_clocks(assignment_id, new_clock_in, new_clock_out, reason). Order:
--     1. not_admin unless get_user_role() = 'admin'.
--     2. Lock the assignment FOR UPDATE: session_not_found, session_archived.
--     3. Lock the appointment FOR UPDATE: session_not_found when missing or archived,
--        visit_cancelled when cancelled. Assignment before appointment, as employee_clock and the
--        crew trigger (20261009120000) lock; the reverse order can deadlock a Cleaner clocking.
--     4. Lock the Cleaner's employees row FOR UPDATE, so overlap checks for one Cleaner serialize.
--     5. Unless both new clocks are null (a clear): clock_in_required, clock_in_future,
--        clock_out_future, clock_out_before_clock_in, then clock_out_required (a never-clocked
--        session given only a clock-in, more than an hour after the visit's scheduled end).
--     6. overlap when [new_clock_in, coalesce(new_clock_out, now())) clashes with another closed,
--        live session of the same Cleaner on a live, uncancelled visit. Open shifts are ignored;
--        touching is allowed.
--     7. A call that changes nothing returns without writing.
--     8. Both clocks in one UPDATE plus the clock_corrections row. Status is left to
--        appointment_employees_derive_status: a correction can complete a visit (and so join an
--        Automatic draft through the invoicing trigger) or reopen it; a Manual completion stays
--        completed.
--   acknowledge_odd_duration(assignment_id, expected_clock_in, expected_clock_out, note). Same role
--     check, locks and session refusals, then session_open (not closed), clocks_changed (the
--     clocks differ from the expected ones) and note_required. Whether a length is odd is decided
--     in TypeScript; this only records the acknowledgement.
--
-- EXECUTE is not revoked from anon or authenticated: revoking it crashes the Supabase PG 17.6 image
-- (see 20260917120000_secure_appointment_employees_view.sql). Each function checks the role itself.
--
-- DOWN. Destroys the audit trail; export it first if any real correction exists.
--
--   DROP FUNCTION "public"."acknowledge_odd_duration"("uuid", timestamp with time zone, timestamp with time zone, "text");
--   DROP FUNCTION "public"."correct_session_clocks"("uuid", timestamp with time zone, timestamp with time zone, "text");
--   DROP FUNCTION "private"."lock_clock_session"("uuid");
--   DROP FUNCTION "public"."clock_error"("text", "text");
--   DROP TABLE "public"."odd_duration_acknowledgements";
--   DROP TABLE "public"."clock_corrections";
--   DROP FUNCTION "private"."refuse_append_only_change"();


-- 1. Append-only guard ---------------------------------------------------------------------------

CREATE FUNCTION "private"."refuse_append_only_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	RAISE EXCEPTION USING MESSAGE = TG_TABLE_NAME || ' is append-only: rows can''t be changed or deleted.',
		ERRCODE = 'P0001';
END;
$$;

ALTER FUNCTION "private"."refuse_append_only_change"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."refuse_append_only_change"() IS 'BEFORE UPDATE OR DELETE trigger for the append-only audit tables: always raises, whatever the role.';


-- 2. clock_corrections ---------------------------------------------------------------------------

CREATE TABLE "public"."clock_corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "appointment_employee_id" "uuid" NOT NULL
        REFERENCES "public"."appointment_employees"("id") ON DELETE RESTRICT,
    "corrected_by" "uuid" NOT NULL,
    "corrected_by_name" "text" NOT NULL,
    "corrected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "old_clock_in" timestamp with time zone,
    "old_clock_out" timestamp with time zone,
    "new_clock_in" timestamp with time zone,
    "new_clock_out" timestamp with time zone,
    "reason" "text"
);

ALTER TABLE "public"."clock_corrections" OWNER TO "postgres";

COMMENT ON TABLE "public"."clock_corrections" IS 'Append-only audit of admin clock changes (ESA/CRA: keep 6 years). Written only by correct_session_clocks.';
COMMENT ON COLUMN "public"."clock_corrections"."corrected_by_name" IS 'The admin''s name when they made the correction (JWT full_name, else email), kept even if the account changes.';
COMMENT ON COLUMN "public"."clock_corrections"."reason" IS 'Why the clocks changed, trimmed; null when left blank.';

CREATE INDEX "clock_corrections_appointment_employee_id_idx"
    ON "public"."clock_corrections" ("appointment_employee_id");

ALTER TABLE "public"."clock_corrections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select clock_corrections" ON "public"."clock_corrections" FOR SELECT TO "authenticated"
    USING ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));

CREATE TRIGGER "clock_corrections_append_only"
    BEFORE UPDATE OR DELETE ON "public"."clock_corrections"
    FOR EACH ROW EXECUTE FUNCTION "private"."refuse_append_only_change"();


-- 3. odd_duration_acknowledgements ---------------------------------------------------------------

CREATE TABLE "public"."odd_duration_acknowledgements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "appointment_employee_id" "uuid" NOT NULL
        REFERENCES "public"."appointment_employees"("id") ON DELETE RESTRICT,
    "acknowledged_by" "uuid" NOT NULL,
    "acknowledged_by_name" "text" NOT NULL,
    "acknowledged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "clock_in" timestamp with time zone NOT NULL,
    "clock_out" timestamp with time zone NOT NULL,
    "note" "text" NOT NULL CHECK ("btrim"("note") <> '')
);

ALTER TABLE "public"."odd_duration_acknowledgements" OWNER TO "postgres";

COMMENT ON TABLE "public"."odd_duration_acknowledgements" IS 'Append-only record that an admin found a session''s odd length fine. clock_in and clock_out snapshot the clocks it was given for, so a later correction makes it stale. Written only by acknowledge_odd_duration.';

CREATE INDEX "odd_duration_acknowledgements_appointment_employee_id_idx"
    ON "public"."odd_duration_acknowledgements" ("appointment_employee_id");

ALTER TABLE "public"."odd_duration_acknowledgements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select odd_duration_acknowledgements" ON "public"."odd_duration_acknowledgements" FOR SELECT TO "authenticated"
    USING ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));

CREATE TRIGGER "odd_duration_acknowledgements_append_only"
    BEFORE UPDATE OR DELETE ON "public"."odd_duration_acknowledgements"
    FOR EACH ROW EXECUTE FUNCTION "private"."refuse_append_only_change"();


-- 4. Grants --------------------------------------------------------------------------------------

-- Only the SECURITY DEFINER functions below write; the app only reads, as an admin.
REVOKE ALL ON TABLE "public"."clock_corrections" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."odd_duration_acknowledgements" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."clock_corrections" TO "authenticated";
GRANT SELECT ON TABLE "public"."odd_duration_acknowledgements" TO "authenticated";
GRANT ALL ON TABLE "public"."clock_corrections" TO "service_role";
GRANT ALL ON TABLE "public"."odd_duration_acknowledgements" TO "service_role";


-- 5. clock_error ---------------------------------------------------------------------------------

CREATE FUNCTION "public"."clock_error"("code" "text", "hint" "text" DEFAULT NULL) RETURNS "void"
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


-- 6. Session lock --------------------------------------------------------------------------------

CREATE FUNCTION "private"."lock_clock_session"("p_assignment_id" "uuid",
    OUT "session" "public"."appointment_employees", OUT "visit" "public"."appointments")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	-- Assignment first, then appointment: the order employee_clock and the crew trigger use.
	SELECT * INTO session
	FROM public.appointment_employees
	WHERE appointment_employees.id = p_assignment_id
	FOR UPDATE;

	IF NOT FOUND THEN
		PERFORM public.clock_error('session_not_found');
	END IF;

	IF coalesce(session.is_archived, false) THEN
		PERFORM public.clock_error('session_archived');
	END IF;

	SELECT * INTO visit
	FROM public.appointments
	WHERE appointments.id = session.appointment_id
	FOR UPDATE;

	IF NOT FOUND OR coalesce(visit.is_archived, false) THEN
		PERFORM public.clock_error('session_not_found');
	END IF;

	IF visit.status = 'cancelled' THEN
		PERFORM public.clock_error('visit_cancelled');
	END IF;
END;
$$;

ALTER FUNCTION "private"."lock_clock_session"("uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."lock_clock_session"("uuid") FROM PUBLIC;

COMMENT ON FUNCTION "private"."lock_clock_session"("uuid") IS 'Locks a session (appointment_employees row) then its appointment, FOR UPDATE, and returns both. Refuses session_not_found (missing session, missing or archived visit), session_archived and visit_cancelled.';


-- 7. correct_session_clocks ----------------------------------------------------------------------

CREATE FUNCTION "public"."correct_session_clocks"("assignment_id" "uuid", "new_clock_in" timestamp with time zone,
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

	-- Payroll: refuse here when the session is on a paid Pay run, once Pay runs exist.

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


-- 8. acknowledge_odd_duration --------------------------------------------------------------------

CREATE FUNCTION "public"."acknowledge_odd_duration"("assignment_id" "uuid", "expected_clock_in" timestamp with time zone,
    "expected_clock_out" timestamp with time zone, "note" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	locked record;
	session public.appointment_employees;
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.clock_error('not_admin');
	END IF;

	locked := private.lock_clock_session(acknowledge_odd_duration.assignment_id);
	session := locked.session;

	IF session.clocked_in_at IS NULL OR session.clocked_out_at IS NULL THEN
		PERFORM public.clock_error('session_open');
	END IF;

	-- The admin judged the length they saw; a correction since then needs a fresh look.
	IF session.clocked_in_at IS DISTINCT FROM acknowledge_odd_duration.expected_clock_in
		OR session.clocked_out_at IS DISTINCT FROM acknowledge_odd_duration.expected_clock_out THEN
		PERFORM public.clock_error('clocks_changed');
	END IF;

	IF coalesce(btrim(acknowledge_odd_duration.note), '') = '' THEN
		PERFORM public.clock_error('note_required');
	END IF;

	INSERT INTO public.odd_duration_acknowledgements (
		appointment_employee_id, acknowledged_by, acknowledged_by_name, clock_in, clock_out, note
	) VALUES (
		session.id,
		auth.uid(),
		coalesce(nullif(btrim(auth.jwt() -> 'user_metadata' ->> 'full_name'), ''), auth.jwt() ->> 'email'),
		session.clocked_in_at,
		session.clocked_out_at,
		btrim(acknowledge_odd_duration.note)
	);
END;
$$;

ALTER FUNCTION "public"."acknowledge_odd_duration"("uuid", timestamp with time zone, timestamp with time zone, "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."acknowledge_odd_duration"("uuid", timestamp with time zone, timestamp with time zone, "text") IS 'Records that an admin found a closed session''s odd length fine: appends an odd_duration_acknowledgements row snapshotting the current clocks, refusing when they differ from the ones the admin saw. Admin only; refusals go through clock_error.';
