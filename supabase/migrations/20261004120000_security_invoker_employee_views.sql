-- Employee views move to security_invoker.
--
-- The Supabase advisor flags every view in an exposed schema that runs with its owner's rights
-- (lint 0010, security_definer_view, level ERROR). The four employee views were definer views on
-- purpose: employees have no SELECT policy on "appointments", "jobs" or "appointment_employees",
-- and only their own row of "employees", because RLS cannot mask the admin-only columns those
-- tables carry (prices, the hourly rate, admin_notes, address, e_transfer_email). Each view picked
-- the safe columns and applied its own row filter under definer rights. See
-- 20260911170000_add_employee_profile_fields.sql, 20260917120000_secure_appointment_employees_view.sql
-- and 20260918130000_restrict_employee_price_visibility.sql.
--
-- The definer rights move one level down instead of going away. Each view's column list and WHERE
-- clause is copied verbatim into a SECURITY DEFINER table function in a new "private" schema, and
-- the view becomes a security_invoker SELECT over that function. "private" is not listed in
-- [api].schemas in supabase/config.toml, so PostgREST never exposes the functions themselves; the
-- views stay the only door, with the same names, columns, row sets and grants as before.
--
-- Do not add "private" to [api].schemas: every private function would become an RPC endpoint. Do
-- not "fix" an empty employee screen by adding an employee SELECT policy on "appointments", "jobs"
-- or "appointment_employees", or by widening the one on "employees": each re-opens a column leak.
--
-- A view over a function has no foreign keys for PostgREST to infer embeds from, so the embeds the
-- three employee pages use are restored as computed relationships (part 3): SECURITY INVOKER SQL
-- functions in "public", named after the embed target so the page select strings stay unchanged.
--
-- Performance: SECURITY DEFINER SQL functions are never inlined, so each view materializes the
-- caller's whole filtered set before PostgREST filters it. That is fine at this data size only
-- because the computed relationships in part 4 stay inlinable; see the note there before adding
-- a SET clause to any of them.
--
-- DOWN (verified: executed once against a reset database on 2026-10-04, then the database was
-- reset again). The computed relationships go first because they depend on the view row types;
-- the views are then pointed back at their base tables, which frees the private functions.
--
--   DROP FUNCTION "public"."appointments_employee_view"("public"."appointment_employees_employee_view");
--   DROP FUNCTION "public"."employees_employee_view"("public"."appointment_employees_employee_view");
--   DROP FUNCTION "public"."clients"("public"."appointments_employee_view");
--   DROP FUNCTION "public"."client_locations"("public"."appointments_employee_view");
--   DROP FUNCTION "public"."jobs_employee_view"("public"."appointments_employee_view");
--
--   CREATE OR REPLACE VIEW "public"."appointment_employees_employee_view" WITH ("security_invoker"='false') AS
--    SELECT "id", "appointment_id", "employee_id", "clocked_in_at", "clocked_out_at", "created_at", "updated_at", "is_archived"
--      FROM "public"."appointment_employees"
--     WHERE ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text") OR ("appointment_id" IN ( SELECT "public"."get_employee_appointment_ids"() AS "get_employee_appointment_ids")));
--   CREATE OR REPLACE VIEW "public"."appointments_employee_view" WITH ("security_invoker"='false') AS
--    SELECT "id", "client_id", "job_id", "recurrence_series_id", "scheduled_date", "scheduled_start_time", "scheduled_end_time", "status", "notes", "created_at", "updated_at", "is_archived", "location_id"
--      FROM "public"."appointments"
--     WHERE ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text") OR ("id" IN ( SELECT "public"."get_employee_appointment_ids"() AS "get_employee_appointment_ids")));
--   CREATE OR REPLACE VIEW "public"."jobs_employee_view" WITH ("security_invoker"='false') AS
--    SELECT "id", "name", "description", "is_archived"
--      FROM "public"."jobs"
--     WHERE (NOT "is_archived");
--   CREATE OR REPLACE VIEW "public"."employees_employee_view" WITH ("security_invoker"='false') AS
--    SELECT "id", "user_id", "full_name", "phone", "started_at", "is_active", "created_at", "updated_at", "is_archived"
--      FROM "public"."employees"
--     WHERE (("is_active" = true) AND (NOT "is_archived"));
--
--   COMMENT ON VIEW "public"."appointment_employees_employee_view" IS 'Employee-safe view of appointment_employees. Excludes the admin_notes column. Runs with definer rights and filters to the caller''s assigned appointments itself.';
--   COMMENT ON VIEW "public"."appointments_employee_view" IS 'Employee-safe view of appointments. Excludes the price_override_cents and billed_price_cents columns -- every price is admin-only, on assigned appointments included. Runs with definer rights and filters to the caller''s assigned appointments itself.';
--   COMMENT ON VIEW "public"."jobs_employee_view" IS 'Employee-safe view of jobs. Excludes the hourly_rate_cents column -- every price is admin-only. Runs with definer rights and applies the non-archived filter itself.';
--   COMMENT ON VIEW "public"."employees_employee_view" IS 'Employee-safe view of employees. Excludes address and e_transfer_email columns. Runs with definer rights and filters to active, non-archived employees itself.';
--
--   DROP SCHEMA "private" CASCADE;
--
-- The view bodies are the definitions at 20260917120000:21-31, 20260918130000:107-122 and :56-62,
-- and 20260911170000:22-33, re-wrapped onto fewer lines, and CREATE OR REPLACE keeps the existing
-- SELECT-only grants, so the down path restores the exact access that existed before this migration.


-- 1. The private schema -------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS "private";

ALTER SCHEMA "private" OWNER TO "postgres";

COMMENT ON SCHEMA "private" IS 'Definer-rights functions behind the employee views. Never exposed through PostgREST: keep it out of [api].schemas in supabase/config.toml.';

-- anon gets nothing here, so an unauthenticated caller cannot reach a private function even though
-- PUBLIC keeps EXECUTE on each one (see the note in part 2).
REVOKE ALL ON SCHEMA "private" FROM PUBLIC;

-- Explicitly too, in case a "private" schema already existed with an anon grant of its own.
REVOKE ALL ON SCHEMA "private" FROM "anon";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

GRANT USAGE ON SCHEMA "private" TO "service_role";


-- 2. One definer-rights function per view -------------------------------------------------------

-- Every column list is explicit and must stay explicit: a "SELECT *" here would hand the hidden
-- admin-only columns straight to the view. Each WHERE clause is the old view's, verbatim, and is
-- the whole row-level authorization story for that view.
--
-- EXECUTE is not revoked from PUBLIC: on the Supabase Postgres 17.6 image the denied-EXECUTE path
-- crashes the backend with SIGSEGV (20260917120000_secure_appointment_employees_view.sql:122-130).
-- Withholding USAGE on the schema from anon is what keeps unauthenticated callers out.

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
      WHERE ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text") OR ("ae"."appointment_id" IN ( SELECT "public"."get_employee_appointment_ids"() AS "get_employee_appointment_ids")));
$$;

ALTER FUNCTION "private"."appointment_employees_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."appointment_employees_employee_view"() IS 'Rows of appointment_employees_employee_view: assignments on the caller''s own appointments (all of them for an admin), without admin_notes. Runs with definer rights because employees have no policy on appointment_employees.';

GRANT EXECUTE ON FUNCTION "private"."appointment_employees_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."appointment_employees_employee_view"() TO "service_role";


CREATE OR REPLACE FUNCTION "private"."appointments_employee_view"()
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
        "location_id" "uuid"
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
        "a"."location_id"
       FROM "public"."appointments" "a"
      WHERE ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text") OR ("a"."id" IN ( SELECT "public"."get_employee_appointment_ids"() AS "get_employee_appointment_ids")));
$$;

ALTER FUNCTION "private"."appointments_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."appointments_employee_view"() IS 'Rows of appointments_employee_view: the caller''s assigned appointments (all of them for an admin), without price_override_cents or billed_price_cents. Runs with definer rights because employees have no policy on appointments.';

GRANT EXECUTE ON FUNCTION "private"."appointments_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."appointments_employee_view"() TO "service_role";


CREATE OR REPLACE FUNCTION "private"."jobs_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "name" "text",
        "description" "text",
        "is_archived" boolean
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "j"."id",
        "j"."name",
        "j"."description",
        "j"."is_archived"
       FROM "public"."jobs" "j"
      WHERE (NOT "j"."is_archived");
$$;

ALTER FUNCTION "private"."jobs_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."jobs_employee_view"() IS 'Rows of jobs_employee_view: non-archived jobs, without hourly_rate_cents. Runs with definer rights because employees have no policy on jobs.';

GRANT EXECUTE ON FUNCTION "private"."jobs_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."jobs_employee_view"() TO "service_role";


CREATE OR REPLACE FUNCTION "private"."employees_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "user_id" "uuid",
        "full_name" "text",
        "phone" "text",
        "started_at" "date",
        "is_active" boolean,
        "created_at" timestamp with time zone,
        "updated_at" timestamp with time zone,
        "is_archived" boolean
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "e"."id",
        "e"."user_id",
        "e"."full_name",
        "e"."phone",
        "e"."started_at",
        "e"."is_active",
        "e"."created_at",
        "e"."updated_at",
        "e"."is_archived"
       FROM "public"."employees" "e"
      WHERE (("e"."is_active" = true) AND (NOT "e"."is_archived"));
$$;

ALTER FUNCTION "private"."employees_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."employees_employee_view"() IS 'Rows of employees_employee_view: active, non-archived employees, without address or e_transfer_email. Runs with definer rights because an employee''s policy on employees stops at their own row.';

GRANT EXECUTE ON FUNCTION "private"."employees_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."employees_employee_view"() TO "service_role";


-- 3. The views, now invoker-rights ---------------------------------------------------------------

-- CREATE OR REPLACE keeps each view's name, columns, column order and types, so nothing that reads
-- the views changes. The caller needs USAGE on "private" and EXECUTE on the function, which is
-- exactly what anon lacks.

CREATE OR REPLACE VIEW "public"."appointment_employees_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "appointment_id",
    "employee_id",
    "clocked_in_at",
    "clocked_out_at",
    "created_at",
    "updated_at",
    "is_archived"
   FROM "private"."appointment_employees_employee_view"();

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
   FROM "private"."appointments_employee_view"();

CREATE OR REPLACE VIEW "public"."jobs_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "name",
    "description",
    "is_archived"
   FROM "private"."jobs_employee_view"();

CREATE OR REPLACE VIEW "public"."employees_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "user_id",
    "full_name",
    "phone",
    "started_at",
    "is_active",
    "created_at",
    "updated_at",
    "is_archived"
   FROM "private"."employees_employee_view"();


ALTER VIEW "public"."appointment_employees_employee_view" OWNER TO "postgres";

ALTER VIEW "public"."appointments_employee_view" OWNER TO "postgres";

ALTER VIEW "public"."jobs_employee_view" OWNER TO "postgres";

ALTER VIEW "public"."employees_employee_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."appointment_employees_employee_view" IS 'Employee-safe view of appointment_employees. Excludes the admin_notes column. Runs with the caller''s rights over private.appointment_employees_employee_view(), which filters to the caller''s assigned appointments.';

COMMENT ON VIEW "public"."appointments_employee_view" IS 'Employee-safe view of appointments. Excludes the price_override_cents and billed_price_cents columns -- every price is admin-only, on assigned appointments included. Runs with the caller''s rights over private.appointments_employee_view(), which filters to the caller''s assigned appointments.';

COMMENT ON VIEW "public"."jobs_employee_view" IS 'Employee-safe view of jobs. Excludes the hourly_rate_cents column -- every price is admin-only. Runs with the caller''s rights over private.jobs_employee_view(), which applies the non-archived filter.';

COMMENT ON VIEW "public"."employees_employee_view" IS 'Employee-safe view of employees. Excludes address and e_transfer_email columns. Runs with the caller''s rights over private.employees_employee_view(), which filters to active, non-archived employees.';


-- The views are SELECT-only, as before: none of them is auto-updatable any more, but the grant
-- pattern of 20260917120000 and 20260918130000 is re-applied so the privileges say so outright.
REVOKE ALL ON TABLE "public"."appointment_employees_employee_view" FROM "anon";

REVOKE ALL ON TABLE "public"."appointment_employees_employee_view" FROM "authenticated";

REVOKE ALL ON TABLE "public"."appointment_employees_employee_view" FROM "service_role";

GRANT SELECT ON TABLE "public"."appointment_employees_employee_view" TO "authenticated";

GRANT SELECT ON TABLE "public"."appointment_employees_employee_view" TO "service_role";


REVOKE ALL ON TABLE "public"."appointments_employee_view" FROM "anon";

REVOKE ALL ON TABLE "public"."appointments_employee_view" FROM "authenticated";

REVOKE ALL ON TABLE "public"."appointments_employee_view" FROM "service_role";

GRANT SELECT ON TABLE "public"."appointments_employee_view" TO "authenticated";

GRANT SELECT ON TABLE "public"."appointments_employee_view" TO "service_role";


REVOKE ALL ON TABLE "public"."jobs_employee_view" FROM "anon";

REVOKE ALL ON TABLE "public"."jobs_employee_view" FROM "authenticated";

REVOKE ALL ON TABLE "public"."jobs_employee_view" FROM "service_role";

GRANT SELECT ON TABLE "public"."jobs_employee_view" TO "authenticated";

GRANT SELECT ON TABLE "public"."jobs_employee_view" TO "service_role";


REVOKE ALL ON TABLE "public"."employees_employee_view" FROM "anon";

REVOKE ALL ON TABLE "public"."employees_employee_view" FROM "authenticated";

REVOKE ALL ON TABLE "public"."employees_employee_view" FROM "service_role";

GRANT SELECT ON TABLE "public"."employees_employee_view" TO "authenticated";

GRANT SELECT ON TABLE "public"."employees_employee_view" TO "service_role";


-- 4. Computed relationships for the employee page embeds -----------------------------------------

-- PostgREST treats a function taking a table or view row and returning SETOF another as an embed
-- named after the function; ROWS 1 makes it to-one, so the embed is an object, not an array, as it
-- was when PostgREST inferred it from the foreign keys. Each name is the embed target the pages
-- already use (src/app/(internal)/solutions/(employee)/schedule/page.tsx, schedule/[id]/page.tsx
-- and time-sheets/page.tsx).
--
-- These run with the caller's rights and read the views or RLS-protected tables, so they cannot
-- see a row the caller could not select directly. Never make one SECURITY DEFINER: that would put
-- a definer function back in "public" and bypass the clients and client_locations policies.
-- "SELECT *" is safe here: the result type is pinned to the target's row type.
--
-- No SET search_path, on purpose: a SET clause stops Postgres inlining a SQL function, and
-- PostgREST calls each one once per parent row, so a non-inlined function re-materializes the
-- private function's whole row set per row (~2 s for an employee with 1000 assignments, against
-- ~11 ms inlined). The bodies are fully schema-qualified and run with the caller's rights, so a
-- mutable search_path gives nothing to hijack; the five Supabase lint 0011
-- (function_search_path_mutable) WARNs this produces are accepted. Keep every name qualified.

CREATE OR REPLACE FUNCTION "public"."appointments_employee_view"("public"."appointment_employees_employee_view")
    RETURNS SETOF "public"."appointments_employee_view"
    LANGUAGE "sql" STABLE ROWS 1
    AS $$
    SELECT * FROM "public"."appointments_employee_view" "a" WHERE "a"."id" = $1."appointment_id";
$$;

ALTER FUNCTION "public"."appointments_employee_view"("public"."appointment_employees_employee_view") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."appointments_employee_view"("public"."appointment_employees_employee_view") IS 'PostgREST computed relationship: the appointment of an assignment row.';


CREATE OR REPLACE FUNCTION "public"."employees_employee_view"("public"."appointment_employees_employee_view")
    RETURNS SETOF "public"."employees_employee_view"
    LANGUAGE "sql" STABLE ROWS 1
    AS $$
    SELECT * FROM "public"."employees_employee_view" "e" WHERE "e"."id" = $1."employee_id";
$$;

ALTER FUNCTION "public"."employees_employee_view"("public"."appointment_employees_employee_view") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."employees_employee_view"("public"."appointment_employees_employee_view") IS 'PostgREST computed relationship: the (active, non-archived) employee of an assignment row.';


CREATE OR REPLACE FUNCTION "public"."clients"("public"."appointments_employee_view")
    RETURNS SETOF "public"."clients"
    LANGUAGE "sql" STABLE ROWS 1
    AS $$
    SELECT * FROM "public"."clients" "c" WHERE "c"."id" = $1."client_id";
$$;

ALTER FUNCTION "public"."clients"("public"."appointments_employee_view") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."clients"("public"."appointments_employee_view") IS 'PostgREST computed relationship: the client of an appointment row. Subject to the caller''s clients policies.';


CREATE OR REPLACE FUNCTION "public"."client_locations"("public"."appointments_employee_view")
    RETURNS SETOF "public"."client_locations"
    LANGUAGE "sql" STABLE ROWS 1
    AS $$
    SELECT * FROM "public"."client_locations" "l" WHERE "l"."id" = $1."location_id";
$$;

ALTER FUNCTION "public"."client_locations"("public"."appointments_employee_view") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."client_locations"("public"."appointments_employee_view") IS 'PostgREST computed relationship: the location of an appointment row. Subject to the caller''s client_locations policies.';


CREATE OR REPLACE FUNCTION "public"."jobs_employee_view"("public"."appointments_employee_view")
    RETURNS SETOF "public"."jobs_employee_view"
    LANGUAGE "sql" STABLE ROWS 1
    AS $$
    SELECT * FROM "public"."jobs_employee_view" "j" WHERE "j"."id" = $1."job_id";
$$;

ALTER FUNCTION "public"."jobs_employee_view"("public"."appointments_employee_view") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."jobs_employee_view"("public"."appointments_employee_view") IS 'PostgREST computed relationship: the (non-archived) job of an appointment row.';
