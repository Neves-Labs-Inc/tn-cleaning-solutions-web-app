-- employee_clock becomes the single writer of clock-driven appointment status.
--
-- Until now the RPC (20260917120000_secure_appointment_employees_view.sql:68-135) stamped
-- clocked_in_at / clocked_out_at and never touched "appointments"."status", so a Cleaner who clocked
-- in still read "Scheduled", and so did the admin: the status column only ever moved when an admin
-- edited it, which left the admin list blind to live work. Deriving the status in the application
-- would scatter the rule across every caller and leave a window between the clock write and the
-- status write; computing it here, inside the one transaction that writes the clock, keeps the two
-- in step and keeps the rule in one place. Employee overhaul phase 2, ticket 01.
--
-- CONTRACT -- the signature is unchanged (uuid, text) -> text, so src/types/database.ts does not
-- change. Inside the call, in this order:
--
--   1. 'in' / 'out' are the only actions; anything else raises, as before.
--   2. The caller's own, non-archived assignment row is locked FOR UPDATE, keyed on
--      get_employee_id() and never on a caller-supplied employee id. Not found, or archived
--      (a crew member an admin removed keeps no write path into the recompute) -> 'not_assigned'.
--   3. The parent "appointments" row is locked FOR UPDATE. This serializes two crew members clocking
--      at once, so the recompute in step 7 always sees the other member's committed write.
--   4. A 'completed' appointment returns 'appointment_completed'; a 'cancelled' one returns
--      'appointment_cancelled'. Nothing is written in either case: manual completion and cancellation
--      hold until an admin reopens the appointment.
--   5. The existing guards keep their names and order: 'clock_in_after_clock_out',
--      'already_clocked_in', 'already_clocked_out', 'clock_out_before_clock_in'.
--   6. The clock time is written exactly as before.
--   7. The status is recomputed over the appointment's non-archived assignments:
--        nobody has clocked in                             -> 'scheduled'
--        every row has clocked out (and there is a row)    -> 'completed'
--        otherwise                                         -> 'in_progress'
--      and written only when it differs from the stored value. An admin-set 'scheduled' or
--      'in_progress' is therefore not final: the next clock write recomputes it.
--   8. 'clocked' is returned.
--
-- The RPC never writes 'cancelled' and never writes while cancelled, so "status_before_cancel" and
-- the two CHECK constraints from 20260922120000 are untouched by construction. Admin corrections to
-- clock times (updateClockTime, a plain UPDATE on appointment_employees) move no status; that is
-- deliberate and out of scope here.
--
-- Owner, comment and the three GRANTs are restated unchanged from 20260917120000; see that file for
-- why anon keeps EXECUTE and must not have it revoked.
--
-- DOWN. CREATE OR REPLACE the function with the body from 20260917120000 (lines 68-135 of that file,
-- the same owner, comment and grants). No data is touched by the down path: status values written by
-- this version stay as they are, which is correct, because they were the true state of the clocks.


CREATE OR REPLACE FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
	clocked_in timestamp with time zone;
	clocked_out timestamp with time zone;
	appointment uuid;
	current_status text;
	recomputed_status text;
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

	-- Locking the appointment serializes concurrent crew members, so the recompute below never
	-- reads a teammate's half-written state.
	SELECT appointments.status
	INTO current_status
	FROM public.appointments
	WHERE appointments.id = appointment
	FOR UPDATE;

	IF current_status = 'completed' THEN
		outcome := 'appointment_completed';
	ELSIF current_status = 'cancelled' THEN
		outcome := 'appointment_cancelled';
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

		SELECT CASE
				WHEN count(*) FILTER (WHERE appointment_employees.clocked_in_at IS NOT NULL) = 0 THEN 'scheduled'
				WHEN count(*) = count(*) FILTER (WHERE appointment_employees.clocked_out_at IS NOT NULL) THEN 'completed'
				ELSE 'in_progress'
			END
		INTO recomputed_status
		FROM public.appointment_employees
		WHERE appointment_employees.appointment_id = appointment
			AND NOT coalesce(appointment_employees.is_archived, false);

		UPDATE public.appointments
		SET status = recomputed_status
		WHERE appointments.id = appointment
			AND appointments.status IS DISTINCT FROM recomputed_status;

		outcome := 'clocked';
	END IF;

	RETURN outcome;
END;
$$;


ALTER FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") IS 'Stamps clocked_in_at or clocked_out_at on one of the calling employee''s own assignments, then recomputes the appointment''s status from its non-archived assignments (scheduled until someone clocks in, in_progress while anyone is clocked in and not everyone has clocked out, completed once every assignment has clocked out). Refuses to clock on a completed or cancelled appointment. Runs with definer rights because employees have no policy on appointment_employees or appointments.';


GRANT ALL ON FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") TO "anon";

GRANT ALL ON FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") TO "authenticated";

GRANT ALL ON FUNCTION "public"."employee_clock"("assignment_id" "uuid", "clock_action" "text") TO "service_role";
