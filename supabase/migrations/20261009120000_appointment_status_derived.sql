-- The database becomes the single writer of derived appointment status.
--
-- Status was re-implemented in updateAppointment, cancelAppointment, uncancelAppointment, two pages,
-- the clock UI and employee_clock, and the admin clock override (updateClockTime) and crew changes
-- moved no status at all. Decisions #33 (lifecycle) and #35 (backfill rule); CONTEXT.md
-- "Appointment status", "Manual completion", "Restore".
--
-- CONTRACT
--
--   * "appointments"."manually_completed": an admin marked the visit completed regardless of its
--     clocks. It holds until undone.
--   * Derivation (private.appointment_derived_status), over non-archived assignments, with a NULL
--     is_archived counted as active:
--       cancelled                                      -> never derived; the caller keeps it
--       manually_completed                             -> completed
--       nobody clocked in                              -> scheduled
--       >= 1 clocked in, every one of them clocked out -> completed  (a no-show never holds it open)
--       otherwise                                      -> in_progress
--     It takes the flag as an argument: the BEFORE trigger must derive from NEW's flag, which is not
--     stored yet, and the backfill must ask what the clocks alone would say.
--   * Trigger "appointment_employees_derive_status" (AFTER INSERT, UPDATE OF clocked_in_at,
--     clocked_out_at, is_archived, DELETE): recomputes the appointment unless it is cancelled,
--     writing only on change. Covers employee_clock, the admin clock override and crew changes.
--   * Trigger "appointments_derive_status" (BEFORE UPDATE OF manually_completed, status): a write of
--     'cancelled' is kept; otherwise a flag change, leaving 'cancelled' (Restore), or any status
--     write while the flag is set replaces NEW.status with the derived value, so a flagged row is
--     always completed. Any other status write is kept as written.
--     Column-specific triggers ignore changes made by BEFORE triggers, so an AFTER UPDATE OF status
--     trigger does NOT fire when only manually_completed was in the SET list.
--   * employee_clock refuses clock-in only on a cancelled or manually completed appointment
--     ('appointment_cancelled', 'appointment_completed'). A completion derived from the clocks
--     reopens: a late Cleaner clocks in and the status goes back to in_progress (Franklin,
--     2026-10-09, overriding #33's refusal on every completed row). Clock-out of an open shift
--     always works, so a forced completion never strands an Open shift. It no longer recomputes
--     status: the trigger does.
--
-- Every function here lives in "private", which PostgREST does not expose, so none of them is an
-- RPC endpoint. The trigger functions run with definer rights so the recompute sees every
-- assignment whichever role made the write (employees have no policy on appointment_employees).
-- Lock order is assignment row, then appointment row, as in employee_clock: the crew trigger
-- locks the appointment before reading the clocks, so two writers on one visit serialize and the
-- second always derives from the first one's committed clocks.
--
-- DESTRUCTIVE. "status_before_cancel" and its two CHECK constraints are dropped: owner exception
-- granted on #33 (2026-10-06); Restore recalculates from the clocks instead. This also reverses
-- the 20260922120000 note that status policy stays out of the schema.
--
-- BACKFILL (#35), before the triggers exist: every non-archived completed appointment whose clocks
-- would not derive completed gets manually_completed = true (status untouched); every other
-- non-cancelled, non-archived row is recalculated. Cancelled and archived rows are untouched. The
-- counts are RAISEd as a NOTICE. private.backfill_appointment_status() is kept so pgTAP can pin the
-- rule; it is idempotent.
--
-- DOWN. Recorded values of status_before_cancel are gone for good; cancelled rows restore to
-- 'scheduled' under the old code, which is what NULL meant there.
--
--   DROP TRIGGER "appointments_derive_status" ON "public"."appointments";
--   DROP TRIGGER "appointment_employees_derive_status" ON "public"."appointment_employees";
--   DROP FUNCTION "private"."derive_appointment_status_on_update"();
--   DROP FUNCTION "private"."recompute_appointment_status_from_crew"();
--   DROP FUNCTION "private"."backfill_appointment_status"();
--   DROP FUNCTION "private"."appointment_derived_status"("uuid", boolean);
--   -- Re-run 20261008120000_employee_clock_updates_status.sql verbatim (function, owner, comment,
--   -- grants) to restore the RPC's own recompute and its completed/cancelled clock-out refusal.
--   ALTER TABLE "public"."appointments" DROP COLUMN "manually_completed";
--   -- Re-run the ALTER TABLE / ADD CONSTRAINT / COMMENT statements of
--   -- 20260922120000_appointments_status_before_cancel.sql; every row gets NULL, which both
--   -- CHECKs accept.


-- 1. Schema ------------------------------------------------------------------------------------

ALTER TABLE "public"."appointments"
    DROP CONSTRAINT "appointments_status_before_cancel_only_when_cancelled";

ALTER TABLE "public"."appointments"
    DROP CONSTRAINT "appointments_status_before_cancel_check";

ALTER TABLE "public"."appointments" DROP COLUMN "status_before_cancel";

ALTER TABLE "public"."appointments"
    ADD COLUMN "manually_completed" boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN "public"."appointments"."manually_completed" IS 'An admin marked this appointment completed regardless of its clocks; it holds until undone. While true the derived status is completed.';


-- 2. Derivation ----------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
	-- Qualified with the function name: in a SQL function a same-named column wins over the argument.
	SELECT CASE
			WHEN appointment_derived_status.is_manually_completed THEN 'completed'
			WHEN count(*) FILTER (WHERE crew.clocked_in_at IS NOT NULL) = 0 THEN 'scheduled'
			WHEN count(*) FILTER (WHERE crew.clocked_in_at IS NOT NULL AND crew.clocked_out_at IS NULL) = 0 THEN 'completed'
			ELSE 'in_progress'
		END
	FROM public.appointment_employees AS crew
	WHERE crew.appointment_id = appointment_derived_status.appointment_id
		AND NOT coalesce(crew.is_archived, false);
$$;

ALTER FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) OWNER TO "postgres";

-- Only the definer-rights triggers and the backfill (both run as postgres) call it.
REVOKE ALL ON FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) FROM PUBLIC;

COMMENT ON FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) IS 'The status an appointment''s clocks and Manual completion flag derive: completed when flagged; else scheduled until a non-archived assignment clocks in, completed once every assignment that clocked in has clocked out, in_progress otherwise. Never returns cancelled; callers keep a cancelled row as it is.';


-- 3. Backfill ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."backfill_appointment_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
	-- An admin completed these by hand; the flag keeps them completed once status is derived.
	UPDATE public.appointments
	SET manually_completed = true
	WHERE appointments.status = 'completed'
		AND NOT appointments.is_archived
		AND NOT appointments.manually_completed
		AND private.appointment_derived_status(appointments.id, false) <> 'completed';
	GET DIAGNOSTICS flagged_count = ROW_COUNT;

	UPDATE public.appointments
	SET status = private.appointment_derived_status(appointments.id, appointments.manually_completed)
	WHERE appointments.status <> 'cancelled'
		AND NOT appointments.is_archived
		AND appointments.status IS DISTINCT FROM private.appointment_derived_status(appointments.id, appointments.manually_completed);
	GET DIAGNOSTICS status_changed_count = ROW_COUNT;

	RAISE NOTICE 'appointment status backfill: % row(s) flagged manually_completed, % status(es) changed',
		flagged_count, status_changed_count;
END;
$$;

ALTER FUNCTION "private"."backfill_appointment_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."backfill_appointment_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer) FROM PUBLIC;

COMMENT ON FUNCTION "private"."backfill_appointment_status"(OUT "flagged_count" integer, OUT "status_changed_count" integer) IS 'One-off backfill from 20261009120000 (#35), kept so pgTAP can pin the rule: flags non-archived completed rows the clocks would not complete, then recalculates every other non-cancelled, non-archived row. Idempotent.';

SELECT * FROM "private"."backfill_appointment_status"();


-- 4. Trigger on appointment_employees ------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."recompute_appointment_status_from_crew"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	target_appointment uuid;
	current_status text;
	is_flagged boolean;
	derived_status text;
BEGIN
	IF TG_OP = 'DELETE' THEN
		target_appointment := OLD.appointment_id;
	ELSE
		target_appointment := NEW.appointment_id;
	END IF;

	-- Locked before the clocks are read, so a concurrent writer on the same visit waits and the
	-- read below sees its committed clocks.
	SELECT appointments.status, appointments.manually_completed
	INTO current_status, is_flagged
	FROM public.appointments
	WHERE appointments.id = target_appointment
	FOR UPDATE;

	IF NOT FOUND OR current_status = 'cancelled' THEN
		RETURN NULL;
	END IF;

	derived_status := private.appointment_derived_status(target_appointment, is_flagged);

	IF derived_status IS DISTINCT FROM current_status THEN
		UPDATE public.appointments
		SET status = derived_status
		WHERE appointments.id = target_appointment;
	END IF;

	RETURN NULL;
END;
$$;

ALTER FUNCTION "private"."recompute_appointment_status_from_crew"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."recompute_appointment_status_from_crew"() IS 'Trigger on appointment_employees: re-derives the parent appointment''s status after any clock, archive or crew change, unless it is cancelled. Writes only on change.';

CREATE OR REPLACE TRIGGER "appointment_employees_derive_status"
    AFTER INSERT OR DELETE OR UPDATE OF "clocked_in_at", "clocked_out_at", "is_archived" ON "public"."appointment_employees"
    FOR EACH ROW EXECUTE FUNCTION "private"."recompute_appointment_status_from_crew"();


-- 5. Trigger on appointments ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."derive_appointment_status_on_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
	IF NEW.status = 'cancelled' THEN
		RETURN NEW;
	END IF;

	IF OLD.status = 'cancelled'
		OR NEW.manually_completed
		OR NEW.manually_completed IS DISTINCT FROM OLD.manually_completed THEN
		NEW.status := private.appointment_derived_status(NEW.id, NEW.manually_completed);
	END IF;

	RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."derive_appointment_status_on_update"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."derive_appointment_status_on_update"() IS 'BEFORE UPDATE trigger on appointments: keeps a write of cancelled; on a Manual completion flag change, a Restore out of cancelled, or any status write while flagged, replaces the written status with the derived one.';

CREATE OR REPLACE TRIGGER "appointments_derive_status"
    BEFORE UPDATE OF "manually_completed", "status" ON "public"."appointments"
    FOR EACH ROW EXECUTE FUNCTION "private"."derive_appointment_status_on_update"();


-- 6. employee_clock ------------------------------------------------------------------------------
--
-- Signature unchanged, so src/types/database.ts does not change for it. Order inside the call:
--   1. 'in' / 'out' only; anything else raises.
--   2. The caller's own non-archived assignment is locked FOR UPDATE, keyed on get_employee_id();
--      not found or archived -> 'not_assigned'.
--   3. The appointment row is locked FOR UPDATE (same lock order as the crew trigger).
--   4. Unless this is a clock-out of an open shift: cancelled -> 'appointment_cancelled',
--      manually completed -> 'appointment_completed'. Nothing is written. A completion derived
--      from the clocks is not closed: a late clock-in reopens it.
--   5. 'clock_in_after_clock_out', 'already_clocked_in', 'already_clocked_out',
--      'clock_out_before_clock_in', in that order.
--   6. The clock is written; the crew trigger derives the status. 'clocked' is returned.
--
-- Owner, comment and the three GRANTs are restated from 20261008120000; see
-- 20260917120000_secure_appointment_employees_view.sql for why anon keeps EXECUTE.

CREATE OR REPLACE FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	clocked_in timestamp with time zone;
	clocked_out timestamp with time zone;
	appointment uuid;
	current_status text;
	is_flagged boolean;
	is_open_shift_clock_out boolean;
	outcome text;
BEGIN
	IF clock_action NOT IN ('in', 'out') THEN
		RAISE EXCEPTION 'unknown clock action: %', clock_action;
	END IF;

	SELECT appointment_employees.clocked_in_at, appointment_employees.clocked_out_at, appointment_employees.appointment_id
	INTO clocked_in, clocked_out, appointment
	FROM public.appointment_employees
	WHERE appointment_employees.id = assignment_id
		AND appointment_employees.employee_id = public.get_employee_id()
		AND NOT coalesce(appointment_employees.is_archived, false)
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN 'not_assigned';
	END IF;

	SELECT appointments.status, appointments.manually_completed
	INTO current_status, is_flagged
	FROM public.appointments
	WHERE appointments.id = appointment
	FOR UPDATE;

	-- A forced completion or a cancellation must never strand a Cleaner on an Open shift.
	is_open_shift_clock_out := clock_action = 'out' AND clocked_in IS NOT NULL AND clocked_out IS NULL;

	IF current_status = 'cancelled' AND NOT is_open_shift_clock_out THEN
		outcome := 'appointment_cancelled';
	ELSIF is_flagged AND NOT is_open_shift_clock_out THEN
		outcome := 'appointment_completed';
	ELSIF clock_action = 'in' AND clocked_out IS NOT NULL THEN
		outcome := 'clock_in_after_clock_out';
	ELSIF clock_action = 'in' AND clocked_in IS NOT NULL THEN
		outcome := 'already_clocked_in';
	ELSIF clock_action = 'out' AND clocked_out IS NOT NULL THEN
		outcome := 'already_clocked_out';
	ELSIF clock_action = 'out' AND clocked_in IS NULL THEN
		outcome := 'clock_out_before_clock_in';
	ELSE
		UPDATE public.appointment_employees
		SET clocked_in_at = CASE WHEN clock_action = 'in' THEN now() ELSE clocked_in_at END,
			clocked_out_at = CASE WHEN clock_action = 'out' THEN now() ELSE clocked_out_at END
		WHERE appointment_employees.id = assignment_id;

		outcome := 'clocked';
	END IF;

	RETURN outcome;
END;
$$;


ALTER FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") IS 'Stamps clocked_in_at or clocked_out_at on one of the calling employee''s own assignments; the appointment_employees_derive_status trigger then derives the appointment''s status. Refuses clock-in on a manually completed or cancelled appointment (a completion derived from the clocks reopens on a late clock-in); clock-out of an open shift always works. Runs with definer rights because employees have no policy on appointment_employees or appointments.';


GRANT ALL ON FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") TO "service_role";
