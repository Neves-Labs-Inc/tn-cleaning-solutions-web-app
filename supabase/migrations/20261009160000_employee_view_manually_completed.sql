-- appointments_employee_view gains "manually_completed" (20261009120000), appended as its last
-- column, so the Cleaner pages can tell "an admin marked this complete" (Clock in refused) from
-- "completed by its clocks" (a late Cleaner may still clock in).
--
-- private.appointments_employee_view() has a fixed RETURNS TABLE, so it has to be dropped and
-- recreated, and the public view depends on it. Following the DOWN section of 20261004120000, the
-- view is first pointed back at its base table, which frees the private function. Every step keeps
-- the view's existing columns, so CREATE OR REPLACE works throughout and the four computed
-- relationships typed on its row (clients, client_locations, jobs_employee_view, and
-- appointments_employee_view(appointment_employees_employee_view)) stay in place: their bodies are
-- "SELECT *" over the row type, so they pick up the new column with no change. The whole migration
-- runs in one transaction, so no caller ever sees the interim view.
--
-- DOWN (verified on 2026-10-09: executed inside a rolled-back transaction against a migrated
-- database). CREATE OR REPLACE VIEW cannot drop a column, so the view and everything typed on its row
-- go and come back, in the order of the DOWN section of 20261004120000:
--
--   DROP FUNCTION "public"."appointments_employee_view"("public"."appointment_employees_employee_view");
--   DROP FUNCTION "public"."clients"("public"."appointments_employee_view");
--   DROP FUNCTION "public"."client_locations"("public"."appointments_employee_view");
--   DROP FUNCTION "public"."jobs_employee_view"("public"."appointments_employee_view");
--   DROP VIEW "public"."appointments_employee_view";
--   DROP FUNCTION "private"."appointments_employee_view"();
--
-- then re-run, from 20261004120000, private.appointments_employee_view() with its owner, comment and
-- grants; the public.appointments_employee_view view with its owner, comment, REVOKE/GRANT block;
-- and those four computed relationships with their owners and comments. Finally remove
-- "manually_completed" from appointments_employee_view in src/types/database.ts.


-- 1. Free the private function: the view reads the base table for the rest of this transaction.

CREATE OR REPLACE VIEW "public"."appointments_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "client_id",
    "job_id",
    "recurrence_series_id",
    "scheduled_date",
    "scheduled_start_time",
    "scheduled_end_time",
    "status",
    "notes",
    "created_at",
    "updated_at",
    "is_archived",
    "location_id"
   FROM "public"."appointments";


-- 2. Recreate the private function with the new column -----------------------------------------

DROP FUNCTION "private"."appointments_employee_view"();

-- The column list stays explicit: a "SELECT *" here would hand the admin-only price columns to the
-- view. The WHERE clause is unchanged from 20261004120000 and is the whole row filter.
CREATE FUNCTION "private"."appointments_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "client_id" "uuid",
        "job_id" "uuid",
        "recurrence_series_id" "uuid",
        "scheduled_date" "date",
        "scheduled_start_time" time without time zone,
        "scheduled_end_time" time without time zone,
        "status" "text",
        "notes" "text",
        "created_at" timestamp with time zone,
        "updated_at" timestamp with time zone,
        "is_archived" boolean,
        "location_id" "uuid",
        "manually_completed" boolean
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "a"."id",
        "a"."client_id",
        "a"."job_id",
        "a"."recurrence_series_id",
        "a"."scheduled_date",
        "a"."scheduled_start_time",
        "a"."scheduled_end_time",
        "a"."status",
        "a"."notes",
        "a"."created_at",
        "a"."updated_at",
        "a"."is_archived",
        "a"."location_id",
        "a"."manually_completed"
       FROM "public"."appointments" "a"
      WHERE ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text") OR ("a"."id" IN ( SELECT "public"."get_employee_appointment_ids"() AS "get_employee_appointment_ids")));
$$;

ALTER FUNCTION "private"."appointments_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."appointments_employee_view"() IS 'Rows of appointments_employee_view: the caller''s assigned appointments (all of them for an admin), without price_override_cents or billed_price_cents. Runs with definer rights because employees have no policy on appointments.';

-- EXECUTE stays granted to PUBLIC as in 20261004120000 (revoking it crashes the Postgres 17.6
-- image); withholding USAGE on "private" from anon is what keeps it out.
GRANT EXECUTE ON FUNCTION "private"."appointments_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."appointments_employee_view"() TO "service_role";


-- 3. Point the view back at the private function, column appended -----------------------------

CREATE OR REPLACE VIEW "public"."appointments_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "client_id",
    "job_id",
    "recurrence_series_id",
    "scheduled_date",
    "scheduled_start_time",
    "scheduled_end_time",
    "status",
    "notes",
    "created_at",
    "updated_at",
    "is_archived",
    "location_id",
    "manually_completed"
   FROM "private"."appointments_employee_view"();

ALTER VIEW "public"."appointments_employee_view" OWNER TO "postgres";

COMMENT ON VIEW "public"."appointments_employee_view" IS 'Employee-safe view of appointments. Excludes the price_override_cents and billed_price_cents columns -- every price is admin-only, on assigned appointments included. Runs with the caller''s rights over private.appointments_employee_view(), which filters to the caller''s assigned appointments.';

-- CREATE OR REPLACE keeps the grants, but the 20261004120000 pattern is re-applied so the
-- privileges say SELECT-only outright.
REVOKE ALL ON TABLE "public"."appointments_employee_view" FROM "anon";

REVOKE ALL ON TABLE "public"."appointments_employee_view" FROM "authenticated";

REVOKE ALL ON TABLE "public"."appointments_employee_view" FROM "service_role";

GRANT SELECT ON TABLE "public"."appointments_employee_view" TO "authenticated";

GRANT SELECT ON TABLE "public"."appointments_employee_view" TO "service_role";
