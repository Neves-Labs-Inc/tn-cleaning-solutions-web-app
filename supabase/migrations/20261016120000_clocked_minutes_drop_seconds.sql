-- Clocked time drops seconds: Payroll counts whole minutes between the clock times as displayed,
-- and paid Pay run lines are recomputed under that rule.
--
-- .scratch/clocked-minutes-drop-seconds/spec.md and ticket 02; CONTEXT.md "Clocked time". Builds
-- on 20261014230000 (pay view, pay_run_lines) and 20261014233000 (Mark paid freezes from the view).
--
-- CONTRACT
--
--   * private.clocked_minutes(clock_in, clock_out) -> integer. NULL when either clock is NULL,
--     otherwise the whole-minute difference of the two clocks truncated to the minute, never
--     negative: 9:00:40 to 12:30:10 is 210. The same rule as the app's Clocked time. It truncates
--     on the epoch, so the session TimeZone never changes the result.
--   * pay_period_sessions keeps its columns, order, types, security_invoker, admin gate, grants and
--     comment; only its live minutes come from clocked_minutes. The Odd duration ratio, the draft
--     amount and the values Mark paid freezes follow from them.
--   * private.recompute_paid_pay_run_lines() -> integer runs once here. For every line on a paid
--     run it sets minutes from the session's clocks and amount_cents = round(minutes * rate_cents
--     / 60) on the line's frozen rate_cents. rate_cents, scheduled_date, client_name and job_name
--     are left alone, lines on draft or finalized runs are never touched, and only lines whose
--     values change are written. Returns the count written, so a second call returns 0. Paid lines
--     can only rise, by at most 1 minute each; no Adjustments are made (Franklin's call). Totals
--     are summed live from pay_run_lines, so nothing else needs updating.
--
-- DOWN. Re-run section 8 of 20261014230000 (the pay view) with CREATE OR REPLACE VIEW, then:
--
--   DROP FUNCTION "private"."recompute_paid_pay_run_lines"();
--   DROP FUNCTION "private"."clocked_minutes"(timestamp with time zone, timestamp with time zone);
--
-- Recomputed paid lines keep their new values: the old ones are not recorded.


-- 1. clocked_minutes -----------------------------------------------------------------------------

CREATE FUNCTION "private"."clocked_minutes"("clock_in" timestamp with time zone, "clock_out" timestamp with time zone)
    RETURNS integer
    -- STRICT gives NULL for a missing clock: greatest() alone would skip the NULL and return 0.
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
	-- Flooring epoch minutes is date_trunc('minute') without its dependence on the session TimeZone.
	SELECT greatest(0, floor(extract(epoch FROM clock_out) / 60) - floor(extract(epoch FROM clock_in) / 60))::integer;
$$;

ALTER FUNCTION "private"."clocked_minutes"(timestamp with time zone, timestamp with time zone) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."clocked_minutes"(timestamp with time zone, timestamp with time zone) FROM PUBLIC;

-- The pay view is security_invoker, so the admin reading it calls this as authenticated.
GRANT EXECUTE ON FUNCTION "private"."clocked_minutes"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT EXECUTE ON FUNCTION "private"."clocked_minutes"(timestamp with time zone, timestamp with time zone) TO "service_role";

COMMENT ON FUNCTION "private"."clocked_minutes"(timestamp with time zone, timestamp with time zone) IS 'Clocked time in whole minutes: the difference of the two clocks truncated to the minute, never negative; NULL when either clock is NULL.';


-- 2. The pay view (as 20261014230000, live minutes from clocked_minutes) --------------------------

-- security_invoker so the base tables' RLS applies too; the admin filter in WHERE is the view's own
-- gate, so an employee reads no rows even if a base-table policy widens later.
CREATE OR REPLACE VIEW "public"."pay_period_sessions" WITH ("security_invoker" = 'true') AS
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
        -- Whole minutes of Clocked time, seconds dropped, never negative; closed sessions only.
        "private"."clocked_minutes"("session"."clocked_in_at", "session"."clocked_out_at") AS "live_minutes"
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


-- 3. Recompute paid Pay run lines ----------------------------------------------------------------

CREATE FUNCTION "private"."recompute_paid_pay_run_lines"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	updated_count integer;
BEGIN
	UPDATE public.pay_run_lines AS line
	SET minutes = recomputed.minutes,
		amount_cents = recomputed.amount_cents
	FROM (
		SELECT
			paid_line.id,
			clock.minutes,
			-- The frozen rate, not the live one: only the minutes were counted wrong.
			round(clock.minutes::numeric * paid_line.rate_cents / 60)::integer AS amount_cents
		FROM public.pay_run_lines AS paid_line
		JOIN public.pay_runs AS run ON run.id = paid_line.pay_run_id
		JOIN public.appointment_employees AS session ON session.id = paid_line.appointment_employee_id
		CROSS JOIN LATERAL (
			SELECT private.clocked_minutes(session.clocked_in_at, session.clocked_out_at) AS minutes
		) AS clock
		WHERE run.status = 'paid'
			-- A paid session is closed and its clocks are locked; NULLs would break the frozen shape.
			AND clock.minutes IS NOT NULL
	) AS recomputed
	WHERE line.id = recomputed.id
		AND (line.minutes, line.amount_cents) IS DISTINCT FROM (recomputed.minutes, recomputed.amount_cents);
	GET DIAGNOSTICS updated_count = ROW_COUNT;

	RETURN updated_count;
END;
$$;

ALTER FUNCTION "private"."recompute_paid_pay_run_lines"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."recompute_paid_pay_run_lines"() FROM PUBLIC, "anon", "authenticated";

COMMENT ON FUNCTION "private"."recompute_paid_pay_run_lines"() IS 'One-off backfill from 20261016120000, kept so pgTAP can pin the rule: recomputes minutes and amount_cents of every line on a paid Pay run from its session''s clocks (seconds dropped) and its frozen rate_cents, and returns the count of lines changed. Idempotent.';

SELECT "private"."recompute_paid_pay_run_lines"();
