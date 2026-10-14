-- Payroll v2 foundation: settings, Pay period math, Pay rates, the Job pay premium, the pay tables
-- and the admin pay view.
--
-- .scratch/payroll-v2/spec.md and ticket 01; CONTEXT.md "Payroll". Pay lines, blockers and period
-- math are computed in SQL so Mark paid (ticket 03) freezes exactly what the admin reviewed.
-- Business time is America/Toronto.
--
-- CONTRACT
--
--   * payroll_settings(): the Pay period anchor and the Payroll start, both 2026-10-05. Changing
--     either is a deploy. src/lib/payroll mirrors them with a drift test.
--   * pay_period_start(day): anchor + 14 * floor((day - anchor) / 14). A period ends 13 days after
--     it starts; pay_period_has_ended(day) is true once the Toronto Business date is after that end.
--   * pay_rates: effective-dated forward, admin CRUD through RLS (the client_job_pricing pattern).
--     The rate for a shift is the live row with the latest effective_from <= its scheduled date; a
--     partial unique index keeps that row unambiguous. Archived rows don't reserve their date.
--   * jobs.pay_premium_cents and employees.default_payout_method are admin-only: the employee views
--     select explicit column lists that leave them out.
--   * pay_runs, pay_run_lines (the claim), pay_adjustments: RLS on with an admin-only SELECT policy
--     and no write policy; anon has no privilege and authenticated has SELECT only. The write
--     functions (tickets 02 and 03) are SECURITY DEFINER. pay_run_lines.appointment_employee_id is
--     UNIQUE, so a shift is never paid twice. A claim's frozen columns are all NULL until its run
--     is paid, then all set.
--   * pay_period_sessions: admin-only, security_invoker. One row per live session on a live
--     appointment dated on or after the Payroll start, with the Time Sheet rules of
--     src/lib/time-sheets/session-view.ts mirrored in SQL (grace = Toronto scheduled end + 1 h;
--     Odd duration under 0.5x or over 1.5x the scheduled length unless an acknowledgement matches
--     the current clocks). Keep the two in step. A session on a paid run reports its claim's
--     frozen values instead of live ones.
--
-- DOWN. Destroys every Pay rate, run, claim and Adjustment; export them first if any exist.
--
--   DROP VIEW "public"."pay_period_sessions";
--   DROP TABLE "public"."pay_adjustments";
--   DROP TABLE "public"."pay_run_lines";
--   DROP TABLE "public"."pay_runs";
--   DROP TABLE "public"."pay_rates";
--   ALTER TABLE "public"."employees" DROP COLUMN "default_payout_method";
--   ALTER TABLE "public"."jobs" DROP COLUMN "pay_premium_cents";
--   DROP FUNCTION "public"."pay_period_has_ended"("date");
--   DROP FUNCTION "public"."pay_period_start"("date");
--   DROP FUNCTION "public"."payroll_settings"();


-- 1. Settings and Pay period math ----------------------------------------------------------------

CREATE FUNCTION "public"."payroll_settings"(OUT "pay_period_anchor" "date", OUT "payroll_start" "date")
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
	SELECT DATE '2026-10-05', DATE '2026-10-05';
$$;

ALTER FUNCTION "public"."payroll_settings"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."payroll_settings"() IS 'The Pay period anchor (a Monday) and the Payroll start, the first Pay period paid through the app. Mirrored in src/lib/payroll; changing either is a deploy.';


CREATE FUNCTION "public"."pay_period_start"("day" "date") RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
	-- 14 days per period. floor, not integer division, so dates before the anchor round down too.
	SELECT settings.pay_period_anchor + 14 * floor((pay_period_start.day - settings.pay_period_anchor) / 14.0)::integer
	FROM public.payroll_settings() AS settings;
$$;

ALTER FUNCTION "public"."pay_period_start"("date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."pay_period_start"("date") IS 'The first day of the Pay period containing day. The period ends 13 days later.';


CREATE FUNCTION "public"."pay_period_has_ended"("day" "date") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
	SELECT (now() AT TIME ZONE 'America/Toronto')::date > public.pay_period_start(pay_period_has_ended.day) + 13;
$$;

ALTER FUNCTION "public"."pay_period_has_ended"("date") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."pay_period_has_ended"("date") IS 'True once the Toronto Business date is after the last day of the Pay period containing day.';


-- 2. pay_rates -----------------------------------------------------------------------------------

CREATE TABLE "public"."pay_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "employee_id" "uuid" NOT NULL REFERENCES "public"."employees"("id") ON DELETE RESTRICT,
    "hourly_rate_cents" integer NOT NULL CHECK ("hourly_rate_cents" > 0),
    "effective_from" "date" NOT NULL,
    "is_archived" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."pay_rates" OWNER TO "postgres";

COMMENT ON TABLE "public"."pay_rates" IS 'A Cleaner''s Pay rate, effective-dated forward. A shift uses the newest non-archived row with effective_from <= its scheduled date. Admin-only.';

-- Two live rates on one date would make "the rate in effect" ambiguous; an archived one must not
-- block re-entering a corrected rate for the same date.
CREATE UNIQUE INDEX "pay_rates_live_employee_id_effective_from_idx"
    ON "public"."pay_rates" ("employee_id", "effective_from")
    WHERE (NOT "is_archived");

ALTER TABLE "public"."pay_rates" ENABLE ROW LEVEL SECURITY;

-- Copied from "Admin full access on client_job_pricing": the only policy, on purpose.
CREATE POLICY "Admin full access on pay_rates" ON "public"."pay_rates" TO "authenticated"
    USING ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"))
    WITH CHECK ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));


-- 3. Admin-only columns --------------------------------------------------------------------------

ALTER TABLE "public"."jobs"
    ADD COLUMN "pay_premium_cents" integer DEFAULT 0 NOT NULL CHECK ("pay_premium_cents" >= 0);

COMMENT ON COLUMN "public"."jobs"."pay_premium_cents" IS 'Job pay premium: cents per hour added to the Pay rate of every Cleaner who works this Job. Admin-only; never in jobs_employee_view.';

ALTER TABLE "public"."employees"
    ADD COLUMN "default_payout_method" "text";

COMMENT ON COLUMN "public"."employees"."default_payout_method" IS 'The Payout method suggested when this Cleaner''s Pay runs are marked paid. Set only by an admin; never in employees_employee_view.';


-- 4. pay_runs ------------------------------------------------------------------------------------

CREATE TABLE "public"."pay_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "employee_id" "uuid" NOT NULL REFERENCES "public"."employees"("id") ON DELETE RESTRICT,
    "period_start" "date" NOT NULL,
    "kind" "text" NOT NULL CHECK ("kind" IN ('regular', 'off_cycle')),
    "status" "text" DEFAULT 'draft' NOT NULL CHECK ("status" IN ('draft', 'finalized', 'paid')),
    "finalized_at" timestamp with time zone,
    "paid_on" "date",
    "payout_method" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL,
    CONSTRAINT "pay_runs_period_start_check" CHECK (
        "period_start" = "public"."pay_period_start"("period_start")
        AND "period_start" >= ("public"."payroll_settings"())."payroll_start"
    ),
    CONSTRAINT "pay_runs_paid_shape_check" CHECK (
        "status" <> 'paid'
        OR ("paid_on" IS NOT NULL AND "paid_at" IS NOT NULL AND "btrim"(coalesce("payout_method", '')) <> '')
    )
);

ALTER TABLE "public"."pay_runs" OWNER TO "postgres";

COMMENT ON TABLE "public"."pay_runs" IS 'A Cleaner''s Pay run for one Pay period. A draft row stores no amounts: it holds Adjustments, an added Cleaner or a started off-cycle run. Written only by the Payroll functions.';

CREATE UNIQUE INDEX "pay_runs_one_regular_idx"
    ON "public"."pay_runs" ("employee_id", "period_start")
    WHERE ("kind" = 'regular');

-- Per kind, so an off-cycle run can start while the regular run is finalized but not yet paid.
CREATE UNIQUE INDEX "pay_runs_one_unpaid_per_kind_idx"
    ON "public"."pay_runs" ("employee_id", "period_start", "kind")
    WHERE ("status" <> 'paid');

CREATE INDEX "pay_runs_period_start_idx" ON "public"."pay_runs" ("period_start");


-- 5. pay_run_lines (the claim) -------------------------------------------------------------------

CREATE TABLE "public"."pay_run_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "pay_run_id" "uuid" NOT NULL REFERENCES "public"."pay_runs"("id") ON DELETE CASCADE,
    "appointment_employee_id" "uuid" NOT NULL UNIQUE
        REFERENCES "public"."appointment_employees"("id") ON DELETE RESTRICT,
    "scheduled_date" "date",
    "client_name" "text",
    "job_name" "text",
    "minutes" integer,
    "rate_cents" integer,
    "amount_cents" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    -- Frozen together when the run is paid; a half-frozen line couldn't be explained.
    CONSTRAINT "pay_run_lines_frozen_shape_check" CHECK (
        num_nulls("scheduled_date", "client_name", "job_name", "minutes", "rate_cents", "amount_cents") IN (0, 6)
    )
);

ALTER TABLE "public"."pay_run_lines" OWNER TO "postgres";

COMMENT ON TABLE "public"."pay_run_lines" IS 'A session claimed by a Pay run. appointment_employee_id is unique, so a shift is never paid twice. The frozen columns are NULL until the run is paid, then all set.';

CREATE INDEX "pay_run_lines_pay_run_id_idx" ON "public"."pay_run_lines" ("pay_run_id");


-- 6. pay_adjustments -----------------------------------------------------------------------------

CREATE TABLE "public"."pay_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "pay_run_id" "uuid" NOT NULL REFERENCES "public"."pay_runs"("id") ON DELETE CASCADE,
    "amount_cents" integer NOT NULL CHECK ("amount_cents" <> 0),
    "reason" "text" NOT NULL CHECK ("btrim"("reason") <> ''),
    "appointment_employee_id" "uuid" REFERENCES "public"."appointment_employees"("id") ON DELETE RESTRICT,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."pay_adjustments" OWNER TO "postgres";

COMMENT ON TABLE "public"."pay_adjustments" IS 'An Adjustment: a positive or negative line on one Pay run with a reason, optionally pointing at one of the run''s sessions.';

CREATE INDEX "pay_adjustments_pay_run_id_idx" ON "public"."pay_adjustments" ("pay_run_id");


-- 7. RLS and grants ------------------------------------------------------------------------------

ALTER TABLE "public"."pay_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pay_run_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pay_adjustments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select pay_runs" ON "public"."pay_runs" FOR SELECT TO "authenticated"
    USING ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));
CREATE POLICY "Admin select pay_run_lines" ON "public"."pay_run_lines" FOR SELECT TO "authenticated"
    USING ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));
CREATE POLICY "Admin select pay_adjustments" ON "public"."pay_adjustments" FOR SELECT TO "authenticated"
    USING ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));

-- Supabase's default privileges grant ALL on new tables to anon and authenticated; take them back.
REVOKE ALL ON TABLE "public"."pay_rates" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."pay_runs" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."pay_run_lines" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."pay_adjustments" FROM "anon", "authenticated";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."pay_rates" TO "authenticated";
GRANT SELECT ON TABLE "public"."pay_runs" TO "authenticated";
GRANT SELECT ON TABLE "public"."pay_run_lines" TO "authenticated";
GRANT SELECT ON TABLE "public"."pay_adjustments" TO "authenticated";

GRANT ALL ON TABLE "public"."pay_rates" TO "service_role";
GRANT ALL ON TABLE "public"."pay_runs" TO "service_role";
GRANT ALL ON TABLE "public"."pay_run_lines" TO "service_role";
GRANT ALL ON TABLE "public"."pay_adjustments" TO "service_role";


-- 8. The pay view --------------------------------------------------------------------------------

-- security_invoker so the base tables' RLS applies too; the admin filter in WHERE is the view's own
-- gate, so an employee reads no rows even if a base-table policy widens later.
CREATE VIEW "public"."pay_period_sessions" WITH ("security_invoker" = 'true') AS
SELECT
    "session"."employee_id",
    coalesce("run"."period_start", "public"."pay_period_start"("visit"."scheduled_date")) AS "period_start",
    "visit"."id" AS "appointment_id",
    "session"."id" AS "appointment_employee_id",
    CASE WHEN "paid"."is_paid" THEN "line"."scheduled_date" ELSE "visit"."scheduled_date" END AS "scheduled_date",
    "visit"."scheduled_start_time",
    "visit"."scheduled_end_time",
    CASE WHEN "paid"."is_paid" THEN "line"."client_name" ELSE "client"."name" END AS "client_name",
    CASE WHEN "paid"."is_paid" THEN "line"."job_name" ELSE "job"."name" END AS "job_name",
    "visit"."status" AS "appointment_status",
    -- Cancelled visits never pay.
    "visit"."status" <> 'cancelled' AS "is_payable",
    "session"."clocked_in_at",
    "session"."clocked_out_at",
    "state"."state",
    "state"."state" = 'open' AS "is_open_shift",
    "state"."state" = 'not_clocked' AND "visit"."status" <> 'cancelled' AS "is_missing_clock",
    "state"."state" = 'closed'
        AND "clock"."scheduled_minutes" > 0
        AND ("clock"."live_minutes"::numeric / "clock"."scheduled_minutes" < 0.5
            OR "clock"."live_minutes"::numeric / "clock"."scheduled_minutes" > 1.5)
        AND NOT EXISTS (
            SELECT 1
            FROM "public"."odd_duration_acknowledgements" "ack"
            WHERE "ack"."appointment_employee_id" = "session"."id"
                AND "ack"."clock_in" = "session"."clocked_in_at"
                AND "ack"."clock_out" = "session"."clocked_out_at"
        ) AS "is_odd_duration",
    CASE WHEN "paid"."is_paid" THEN "line"."minutes" ELSE "clock"."live_minutes" END AS "clocked_minutes",
    -- A paid line keeps only its frozen effective rate; the live parts no longer apply to it.
    CASE WHEN "paid"."is_paid" THEN NULL ELSE "rate"."hourly_rate_cents" END AS "base_rate_cents",
    CASE WHEN "paid"."is_paid" THEN NULL ELSE "job"."pay_premium_cents" END AS "pay_premium_cents",
    CASE WHEN "paid"."is_paid" THEN "line"."rate_cents" ELSE "live"."effective_rate_cents" END AS "effective_rate_cents",
    CASE WHEN "paid"."is_paid" THEN "line"."amount_cents"
        -- numeric, so a mistyped clock years long can't overflow int4 and break the whole query.
        ELSE round("clock"."live_minutes"::numeric * "live"."effective_rate_cents" / 60)::integer
    END AS "amount_cents",
    NOT "paid"."is_paid" AND "state"."state" = 'closed' AND "rate"."hourly_rate_cents" IS NULL AS "has_no_rate",
    "run"."id" AS "pay_run_id",
    "run"."kind" AS "pay_run_kind",
    "run"."status" AS "pay_run_status"
FROM "public"."appointment_employees" "session"
JOIN "public"."appointments" "visit" ON "visit"."id" = "session"."appointment_id"
LEFT JOIN "public"."clients" "client" ON "client"."id" = "visit"."client_id"
LEFT JOIN "public"."jobs" "job" ON "job"."id" = "visit"."job_id"
LEFT JOIN "public"."pay_run_lines" "line" ON "line"."appointment_employee_id" = "session"."id"
LEFT JOIN "public"."pay_runs" "run" ON "run"."id" = "line"."pay_run_id"
CROSS JOIN LATERAL (
    SELECT coalesce("run"."status" = 'paid', false) AS "is_paid"
) "paid"
CROSS JOIN LATERAL (
    SELECT
        -- Mirrors session-view.ts: the visit's Toronto wall-clock end + FLAG_GRACE_HOURS (1).
        now() >= (("visit"."scheduled_date" + "visit"."scheduled_end_time") AT TIME ZONE 'America/Toronto') + interval '1 hour'
            AS "is_past_grace",
        round(extract(epoch FROM
            (("visit"."scheduled_date" + "visit"."scheduled_end_time") AT TIME ZONE 'America/Toronto')
            - (("visit"."scheduled_date" + "visit"."scheduled_start_time") AT TIME ZONE 'America/Toronto')
        ) / 60)::integer AS "scheduled_minutes",
        -- Whole minutes of Clocked time, never negative; closed sessions only.
        CASE WHEN "session"."clocked_in_at" IS NOT NULL AND "session"."clocked_out_at" IS NOT NULL
            THEN greatest(0, floor(extract(epoch FROM "session"."clocked_out_at" - "session"."clocked_in_at") / 60))::integer
        END AS "live_minutes"
) "clock"
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN "session"."clocked_in_at" IS NOT NULL AND "session"."clocked_out_at" IS NOT NULL THEN 'closed'
        WHEN "session"."clocked_in_at" IS NOT NULL AND "clock"."is_past_grace" THEN 'open'
        WHEN "session"."clocked_in_at" IS NOT NULL THEN 'in_progress'
        WHEN "clock"."is_past_grace" THEN 'not_clocked'
        ELSE 'upcoming'
    END AS "state"
) "state"
LEFT JOIN LATERAL (
    SELECT "pay_rates"."hourly_rate_cents"
    FROM "public"."pay_rates"
    WHERE "pay_rates"."employee_id" = "session"."employee_id"
        AND NOT "pay_rates"."is_archived"
        AND "pay_rates"."effective_from" <= "visit"."scheduled_date"
    ORDER BY "pay_rates"."effective_from" DESC
    LIMIT 1
) "rate" ON true
CROSS JOIN LATERAL (
    SELECT "rate"."hourly_rate_cents" + coalesce("job"."pay_premium_cents", 0) AS "effective_rate_cents"
) "live"
WHERE (( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text")
    AND NOT coalesce("session"."is_archived", false)
    AND NOT coalesce("visit"."is_archived", false)
    AND "visit"."scheduled_date" >= ( SELECT "settings"."payroll_start" FROM "public"."payroll_settings"() "settings");

ALTER VIEW "public"."pay_period_sessions" OWNER TO "postgres";

COMMENT ON VIEW "public"."pay_period_sessions" IS 'Admin-only. One row per live session on a live appointment from the Payroll start on: its Pay period, Time Sheet state and flags (the rules of src/lib/time-sheets/session-view.ts), Clocked minutes, Pay rate + Job pay premium, amount and claiming Pay run. A session on a paid run reports its claim''s frozen values.';

REVOKE ALL ON TABLE "public"."pay_period_sessions" FROM "anon", "authenticated";
GRANT SELECT ON TABLE "public"."pay_period_sessions" TO "authenticated";
GRANT SELECT ON TABLE "public"."pay_period_sessions" TO "service_role";
