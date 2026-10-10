-- get_employee_appointment_ids() stops returning visits whose assignment is archived.
--
-- Crew removal now archives an assignment that has any clock, Clock correction or Odd duration
-- acknowledgement instead of deleting it, because hours records must survive 6 years (Ontario ESA,
-- CRA) and the audit tables reference the row ON DELETE RESTRICT (20261010120000). Before, the
-- delete made the visit vanish for the removed Cleaner; excluding archived rows here keeps that:
-- every policy and employee view gated on this function (the appointments and client_locations
-- policies and the employee views) hides the visit from her again. A NULL flag is a live assignment, matching the crew trigger's coalesce(is_archived, false). A re-added Cleaner has
-- a fresh live row, so she sees the visit through that one.
--
-- CREATE OR REPLACE keeps the owner, the grants and SECURITY DEFINER; the owner is restated anyway.
--
-- DOWN: restore the body from 20260427000000_schema_snapshot.sql:
--
--   CREATE OR REPLACE FUNCTION "public"."get_employee_appointment_ids"() RETURNS SETOF "uuid"
--       LANGUAGE "sql" STABLE SECURITY DEFINER
--       SET "search_path" TO 'public'
--       AS $$
--       SELECT appointment_id
--       FROM public.appointment_employees
--       WHERE employee_id = (
--           SELECT id FROM public.employees WHERE user_id = auth.uid()
--       );
--   $$;
--   COMMENT ON FUNCTION "public"."get_employee_appointment_ids"() IS NULL;

CREATE OR REPLACE FUNCTION "public"."get_employee_appointment_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT appointment_id
    FROM public.appointment_employees
    WHERE employee_id = (
        SELECT id FROM public.employees WHERE user_id = auth.uid()
    )
    AND NOT coalesce(is_archived, false);
$$;

ALTER FUNCTION "public"."get_employee_appointment_ids"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_employee_appointment_ids"() IS 'Ids of the appointments the calling employee is assigned to through a live (non-archived) assignment. Runs with definer rights so it reads appointment_employees past RLS (and without recursing into it); the RLS policies and employee views use it to scope what a Cleaner sees.';
