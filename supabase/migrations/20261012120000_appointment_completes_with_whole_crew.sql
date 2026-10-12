-- An appointment completes only once every Cleaner on its crew has clocked in and out.
--
-- 20261009120000 completed a visit once everyone who clocked in had clocked out, so a Cleaner who
-- never clocked in was ignored and a 2-Cleaner visit showed Completed with one Cleaner clocked.
-- CONTEXT.md "Appointment status".
--
-- CONTRACT
--
--   * Derivation (private.appointment_derived_status), over non-archived assignments, with a NULL
--     is_archived counted as active (Removed sessions never count):
--       cancelled                                          -> never derived; the caller keeps it
--       manually_completed                                 -> completed
--       nobody clocked in (including an empty crew)        -> scheduled
--       every assignment has clocked_in_at AND clocked_out_at -> completed
--       otherwise                                          -> in_progress
--     A Cleaner who never clocks in holds it open until an admin enters her clocks (Clock
--     correction), removes her from the crew, or uses Manual completion.
--   * Signature, owner and grants unchanged, so src/types/database.ts does not change. The
--     triggers and employee_clock from 20261009120000 are untouched.
--
-- NO BACKFILL. private.backfill_appointment_status() is deliberately not called: existing rows
-- keep their status and re-derive under this rule only when the existing triggers next fire
-- (a clock, archive or crew change, a Manual completion flag change, or a Restore).
--
-- DOWN. Restore the 20261009120000 body and comment:
--
--   CREATE OR REPLACE FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) RETURNS "text"
--       LANGUAGE "sql" STABLE
--       SET "search_path" TO ''
--       AS $$
--   	SELECT CASE
--   			WHEN appointment_derived_status.is_manually_completed THEN 'completed'
--   			WHEN count(*) FILTER (WHERE crew.clocked_in_at IS NOT NULL) = 0 THEN 'scheduled'
--   			WHEN count(*) FILTER (WHERE crew.clocked_in_at IS NOT NULL AND crew.clocked_out_at IS NULL) = 0 THEN 'completed'
--   			ELSE 'in_progress'
--   		END
--   	FROM public.appointment_employees AS crew
--   	WHERE crew.appointment_id = appointment_derived_status.appointment_id
--   		AND NOT coalesce(crew.is_archived, false);
--   $$;
--   COMMENT ON FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) IS 'The status an appointment''s clocks and Manual completion flag derive: completed when flagged; else scheduled until a non-archived assignment clocks in, completed once every assignment that clocked in has clocked out, in_progress otherwise. Never returns cancelled; callers keep a cancelled row as it is.';


CREATE OR REPLACE FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
	-- Qualified with the function name: in a SQL function a same-named column wins over the argument.
	SELECT CASE
			WHEN appointment_derived_status.is_manually_completed THEN 'completed'
			WHEN count(*) FILTER (WHERE crew.clocked_in_at IS NOT NULL) = 0 THEN 'scheduled'
			-- A Cleaner missing either clock, including one who never clocked in, holds it open.
			WHEN count(*) FILTER (WHERE crew.clocked_in_at IS NULL OR crew.clocked_out_at IS NULL) = 0 THEN 'completed'
			ELSE 'in_progress'
		END
	FROM public.appointment_employees AS crew
	WHERE crew.appointment_id = appointment_derived_status.appointment_id
		AND NOT coalesce(crew.is_archived, false);
$$;

ALTER FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) OWNER TO "postgres";

-- Only the definer-rights triggers and the backfill (both run as postgres) call it.
REVOKE ALL ON FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) FROM PUBLIC;

COMMENT ON FUNCTION "private"."appointment_derived_status"("appointment_id" "uuid", "is_manually_completed" boolean) IS 'The status an appointment''s clocks and Manual completion flag derive, over non-archived assignments: completed when flagged; else scheduled until one clocks in, completed once every one has clocked in and out (a Cleaner who never clocks in holds it open), in_progress otherwise. Never returns cancelled; callers keep a cancelled row as it is.';
