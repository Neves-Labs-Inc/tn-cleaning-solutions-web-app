-- appointment_employees_employee_view stops returning archived assignments to Cleaners.
--
-- Crew removal now archives an assignment with session history instead of deleting it
-- (20261010130000). Before, the removed Cleaner's row was gone; now a teammate still on the visit
-- could read it (employee_id and clock times) through this view, and a re-added Cleaner would get
-- her old archived row next to her fresh one. A Cleaner now gets live rows only, NULL counting as
-- live as in the crew trigger's coalesce(is_archived, false). Admins still get every row.
--
-- Same RETURNS TABLE, so CREATE OR REPLACE keeps the owner, the grants and SECURITY DEFINER, and the
-- public view on top of it is untouched. The owner and comment are restated.
--
-- DOWN: re-run the private.appointment_employees_employee_view() definition, owner and comment from
-- 20261004120000_security_invoker_employee_views.sql (part 2), which has the same WHERE clause
-- without the archived condition.

CREATE OR REPLACE FUNCTION "private"."appointment_employees_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "appointment_id" "uuid",
        "employee_id" "uuid",
        "clocked_in_at" timestamp with time zone,
        "clocked_out_at" timestamp with time zone,
        "created_at" timestamp with time zone,
        "updated_at" timestamp with time zone,
        "is_archived" boolean
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "ae"."id",
        "ae"."appointment_id",
        "ae"."employee_id",
        "ae"."clocked_in_at",
        "ae"."clocked_out_at",
        "ae"."created_at",
        "ae"."updated_at",
        "ae"."is_archived"
       FROM "public"."appointment_employees" "ae"
      WHERE ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text")
          OR (("ae"."appointment_id" IN ( SELECT "public"."get_employee_appointment_ids"() AS "get_employee_appointment_ids"))
              AND NOT coalesce("ae"."is_archived", false)));
$$;

ALTER FUNCTION "private"."appointment_employees_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."appointment_employees_employee_view"() IS 'Rows of appointment_employees_employee_view: live (non-archived) assignments on the caller''s own appointments (every row for an admin), without admin_notes. Runs with definer rights because employees have no policy on appointment_employees.';
