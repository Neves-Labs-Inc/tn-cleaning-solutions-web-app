-- removed_sessions_employee_view: a Cleaner reads her own Removed sessions.
--
-- A Removed session is an archived appointment_employees row: the Cleaner was taken off the crew
-- after she had clocks, a Clock correction or an acknowledgement (20261010130000). It stays on her
-- Time sheet, struck through and not counted. She cannot read it through the existing employee
-- views: get_employee_appointment_ids() and appointment_employees_employee_view are live-only
-- (20261010130000, 20261010140000), so the visit, its client and its crew row are all hidden
-- from her. That must stay so: the removed visit must not come back on her schedule or appointment
-- pages. This view is a separate, narrow door instead.
--
-- Same shape as the employee views (20261004120000): a SECURITY DEFINER table function in
-- "private" (never exposed through PostgREST) carries the row filter and an explicit column list,
-- and a security_invoker view in "public" selects from it, SELECT-only (CONSTITUTION §10). The rows
-- are only the caller's own archived sessions on visits that are neither archived nor cancelled,
-- never a teammate's; an admin, who has no employees row, gets none. The columns are what her Time
-- sheet shows (scheduled date, client name, Job name, clocks) and no price (CONSTITUTION §11). The
-- names are read under definer rights because the clients policy no longer lets her see a client
-- whose visit she was removed from. Rows are flat: there is no visit for an embed to point at.
--
-- No backfill: a view over existing rows.
--
-- DOWN:
--
--   DROP VIEW "public"."removed_sessions_employee_view";
--   DROP FUNCTION "private"."removed_sessions_employee_view"();


CREATE OR REPLACE FUNCTION "private"."removed_sessions_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "appointment_id" "uuid",
        "employee_id" "uuid",
        "scheduled_date" "date",
        "client_name" "text",
        "job_name" "text",
        "clocked_in_at" timestamp with time zone,
        "clocked_out_at" timestamp with time zone
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "ae"."id",
        "ae"."appointment_id",
        "ae"."employee_id",
        "a"."scheduled_date",
        "c"."name",
        "j"."name",
        "ae"."clocked_in_at",
        "ae"."clocked_out_at"
       FROM "public"."appointment_employees" "ae"
       JOIN "public"."appointments" "a" ON "a"."id" = "ae"."appointment_id"
       JOIN "public"."clients" "c" ON "c"."id" = "a"."client_id"
       JOIN "public"."jobs" "j" ON "j"."id" = "a"."job_id"
      WHERE "ae"."employee_id" = ( SELECT "e"."id" FROM "public"."employees" "e" WHERE "e"."user_id" = ( SELECT "auth"."uid"() AS "uid"))
        AND coalesce("ae"."is_archived", false)
        AND NOT coalesce("a"."is_archived", false)
        AND "a"."status" <> 'cancelled'::"text";
$$;

ALTER FUNCTION "private"."removed_sessions_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."removed_sessions_employee_view"() IS 'Rows of removed_sessions_employee_view: the caller''s own archived assignments (Removed sessions) on live, non-cancelled appointments, with the client and Job names and no price. Runs with definer rights because the caller can no longer read the appointment, client or assignment herself.';

-- EXECUTE stays with PUBLIC, as on the other private functions (see 20261004120000 part 2);
-- anon has no USAGE on "private", which keeps unauthenticated callers out.
GRANT EXECUTE ON FUNCTION "private"."removed_sessions_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."removed_sessions_employee_view"() TO "service_role";


CREATE OR REPLACE VIEW "public"."removed_sessions_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "appointment_id",
    "employee_id",
    "scheduled_date",
    "client_name",
    "job_name",
    "clocked_in_at",
    "clocked_out_at"
   FROM "private"."removed_sessions_employee_view"();

ALTER VIEW "public"."removed_sessions_employee_view" OWNER TO "postgres";

COMMENT ON VIEW "public"."removed_sessions_employee_view" IS 'The calling Cleaner''s own Removed sessions (archived assignments) for her Time sheet: scheduled date, client and Job names, clocks; no price. Runs with the caller''s rights over private.removed_sessions_employee_view(), which applies the row filter.';

REVOKE ALL ON TABLE "public"."removed_sessions_employee_view" FROM "anon";

REVOKE ALL ON TABLE "public"."removed_sessions_employee_view" FROM "authenticated";

REVOKE ALL ON TABLE "public"."removed_sessions_employee_view" FROM "service_role";

GRANT SELECT ON TABLE "public"."removed_sessions_employee_view" TO "authenticated";

GRANT SELECT ON TABLE "public"."removed_sessions_employee_view" TO "service_role";
