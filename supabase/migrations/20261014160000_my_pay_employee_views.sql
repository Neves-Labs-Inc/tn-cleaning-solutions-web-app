-- My pay: a Cleaner reads her own paid Pay runs, their frozen lines and their Adjustments.
--
-- pay_runs, pay_run_lines and pay_adjustments are admin-only through RLS (20261014120000), and an
-- employee policy on them would hand her every column: draft and finalized runs, the claim's
-- appointment_employee_id, created_by. Three narrow doors instead, the shape of the employee views
-- (20261004120000, 20261011170000): a SECURITY DEFINER table function in "private" (never exposed
-- through PostgREST) carries the row filter and an explicit column list, and a security_invoker
-- view in "public" selects from it, SELECT-only.
--
-- Rows: only runs with status 'paid' whose employee row is the caller's (employees.user_id =
-- auth.uid()), and the lines and Adjustments of those runs. Draft and finalized runs never show:
-- their lines carry no frozen values yet and their totals can still change. An admin has no
-- employees row, so she gets no rows; admins read the base tables. Pay rates, the default Payout
-- method and the e-Transfer contact live on other tables and are never read here.
--
-- Columns: frozen values only. A line's rate_cents already folds in the Job pay premium, so the
-- premium never shows as its own line. An Adjustment's linked session is shown as that claim's
-- frozen date and client on the same run.
--
-- No backfill: views over existing rows.
--
-- DOWN:
--
--   DROP VIEW "public"."pay_adjustments_employee_view";
--   DROP VIEW "public"."pay_run_lines_employee_view";
--   DROP VIEW "public"."pay_runs_employee_view";
--   DROP FUNCTION "private"."pay_adjustments_employee_view"();
--   DROP FUNCTION "private"."pay_run_lines_employee_view"();
--   DROP FUNCTION "private"."pay_runs_employee_view"();
--   DROP FUNCTION "private"."my_paid_pay_run_ids"();


-- 1. The caller's paid runs -----------------------------------------------------------------------

-- The one row filter all three functions share. Not exposed: "private" stays out of [api].schemas.
CREATE OR REPLACE FUNCTION "private"."my_paid_pay_run_ids"()
    RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "run"."id"
       FROM "public"."pay_runs" "run"
      WHERE "run"."status" = 'paid'::"text"
        AND "run"."employee_id" = ( SELECT "e"."id" FROM "public"."employees" "e" WHERE "e"."user_id" = ( SELECT "auth"."uid"() AS "uid"));
$$;

ALTER FUNCTION "private"."my_paid_pay_run_ids"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."my_paid_pay_run_ids"() IS 'Ids of the calling Cleaner''s own paid Pay runs; none for an admin or a caller with no employees row. The row filter behind the My pay views.';

-- EXECUTE stays with PUBLIC, as on the other private functions (see 20261004120000 part 2);
-- anon has no USAGE on "private", which keeps unauthenticated callers out.
GRANT EXECUTE ON FUNCTION "private"."my_paid_pay_run_ids"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."my_paid_pay_run_ids"() TO "service_role";


-- 2. One definer-rights function per view ----------------------------------------------------------

-- Every column list is explicit and must stay explicit: "SELECT *" would hand created_by, the
-- claim ids and the run's status history straight to the view.

CREATE OR REPLACE FUNCTION "private"."pay_runs_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "period_start" "date",
        "kind" "text",
        "paid_on" "date",
        "payout_method" "text",
        "total_cents" bigint
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "run"."id",
        "run"."period_start",
        "run"."kind",
        "run"."paid_on",
        "run"."payout_method",
        -- bigint, so a long run of large amounts can't overflow int4.
        coalesce(( SELECT sum("line"."amount_cents") FROM "public"."pay_run_lines" "line" WHERE "line"."pay_run_id" = "run"."id"), 0)
            + coalesce(( SELECT sum("adj"."amount_cents") FROM "public"."pay_adjustments" "adj" WHERE "adj"."pay_run_id" = "run"."id"), 0)
       FROM "public"."pay_runs" "run"
      WHERE "run"."id" IN ( SELECT "private"."my_paid_pay_run_ids"());
$$;

ALTER FUNCTION "private"."pay_runs_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."pay_runs_employee_view"() IS 'Rows of pay_runs_employee_view: the caller''s own paid Pay runs with their total (frozen lines plus Adjustments). Runs with definer rights because pay_runs is admin-only.';

GRANT EXECUTE ON FUNCTION "private"."pay_runs_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."pay_runs_employee_view"() TO "service_role";


CREATE OR REPLACE FUNCTION "private"."pay_run_lines_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "pay_run_id" "uuid",
        "scheduled_date" "date",
        "client_name" "text",
        "minutes" integer,
        "rate_cents" integer,
        "amount_cents" integer
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "line"."id",
        "line"."pay_run_id",
        "line"."scheduled_date",
        "line"."client_name",
        "line"."minutes",
        "line"."rate_cents",
        "line"."amount_cents"
       FROM "public"."pay_run_lines" "line"
      WHERE "line"."pay_run_id" IN ( SELECT "private"."my_paid_pay_run_ids"());
$$;

ALTER FUNCTION "private"."pay_run_lines_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."pay_run_lines_employee_view"() IS 'Rows of pay_run_lines_employee_view: the frozen lines of the caller''s own paid Pay runs. Runs with definer rights because pay_run_lines is admin-only.';

GRANT EXECUTE ON FUNCTION "private"."pay_run_lines_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."pay_run_lines_employee_view"() TO "service_role";


CREATE OR REPLACE FUNCTION "private"."pay_adjustments_employee_view"()
    RETURNS TABLE (
        "id" "uuid",
        "pay_run_id" "uuid",
        "amount_cents" integer,
        "reason" "text",
        "linked_scheduled_date" "date",
        "linked_client_name" "text",
        "created_at" timestamp with time zone
    )
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT "adj"."id",
        "adj"."pay_run_id",
        "adj"."amount_cents",
        "adj"."reason",
        "line"."scheduled_date",
        "line"."client_name",
        "adj"."created_at"
       FROM "public"."pay_adjustments" "adj"
       -- The linked session as the run froze it; the live visit may have moved since.
       LEFT JOIN "public"."pay_run_lines" "line"
         ON "line"."appointment_employee_id" = "adj"."appointment_employee_id"
        AND "line"."pay_run_id" = "adj"."pay_run_id"
      WHERE "adj"."pay_run_id" IN ( SELECT "private"."my_paid_pay_run_ids"());
$$;

ALTER FUNCTION "private"."pay_adjustments_employee_view"() OWNER TO "postgres";

COMMENT ON FUNCTION "private"."pay_adjustments_employee_view"() IS 'Rows of pay_adjustments_employee_view: the Adjustments on the caller''s own paid Pay runs, with the linked line''s frozen date and client. Runs with definer rights because pay_adjustments is admin-only.';

GRANT EXECUTE ON FUNCTION "private"."pay_adjustments_employee_view"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."pay_adjustments_employee_view"() TO "service_role";


-- 3. The views, invoker-rights --------------------------------------------------------------------

CREATE OR REPLACE VIEW "public"."pay_runs_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "period_start",
    "kind",
    "paid_on",
    "payout_method",
    "total_cents"
   FROM "private"."pay_runs_employee_view"();

CREATE OR REPLACE VIEW "public"."pay_run_lines_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "pay_run_id",
    "scheduled_date",
    "client_name",
    "minutes",
    "rate_cents",
    "amount_cents"
   FROM "private"."pay_run_lines_employee_view"();

CREATE OR REPLACE VIEW "public"."pay_adjustments_employee_view" WITH ("security_invoker"='true') AS
 SELECT "id",
    "pay_run_id",
    "amount_cents",
    "reason",
    "linked_scheduled_date",
    "linked_client_name",
    "created_at"
   FROM "private"."pay_adjustments_employee_view"();

ALTER VIEW "public"."pay_runs_employee_view" OWNER TO "postgres";

ALTER VIEW "public"."pay_run_lines_employee_view" OWNER TO "postgres";

ALTER VIEW "public"."pay_adjustments_employee_view" OWNER TO "postgres";

COMMENT ON VIEW "public"."pay_runs_employee_view" IS 'The calling Cleaner''s own paid Pay runs for My pay: period, kind, paid date, Payout method and total. Runs with the caller''s rights over private.pay_runs_employee_view(), which applies the row filter. Admins get no rows.';

COMMENT ON VIEW "public"."pay_run_lines_employee_view" IS 'The frozen lines of the calling Cleaner''s own paid Pay runs: date, client, minutes, rate used (Job pay premium included) and amount. Runs with the caller''s rights over private.pay_run_lines_employee_view(). Admins get no rows.';

COMMENT ON VIEW "public"."pay_adjustments_employee_view" IS 'The Adjustments on the calling Cleaner''s own paid Pay runs, with reason and the linked line''s date and client. Runs with the caller''s rights over private.pay_adjustments_employee_view(). Admins get no rows.';


-- SELECT-only, as the other employee views: Supabase's default privileges would grant ALL.
REVOKE ALL ON TABLE "public"."pay_runs_employee_view" FROM "anon", "authenticated", "service_role";

GRANT SELECT ON TABLE "public"."pay_runs_employee_view" TO "authenticated", "service_role";

REVOKE ALL ON TABLE "public"."pay_run_lines_employee_view" FROM "anon", "authenticated", "service_role";

GRANT SELECT ON TABLE "public"."pay_run_lines_employee_view" TO "authenticated", "service_role";

REVOKE ALL ON TABLE "public"."pay_adjustments_employee_view" FROM "anon", "authenticated", "service_role";

GRANT SELECT ON TABLE "public"."pay_adjustments_employee_view" TO "authenticated", "service_role";
