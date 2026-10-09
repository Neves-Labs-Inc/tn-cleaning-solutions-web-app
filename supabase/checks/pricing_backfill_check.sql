-- Read-only report on what 20260918120000_hourly_pricing_and_client_job_pricing.sql did.
--
--   npx supabase db query --file supabase/checks/pricing_backfill_check.sql --local
--
-- On 2026-09-18 every job's price stopped meaning "dollars per visit" and started meaning
-- "dollars per hour", with no value recalculated. That changes what most jobs actually cost. The
-- change was chosen deliberately, so this script corrects nothing and writes nothing at all -- it
-- exists so a human can see the size of the change before deploying, and so the same human can
-- confirm afterwards that no already-invoiced amount moved.
--
-- Sections 1 and 2 are the judgement call. Section 3 is the part that must be boring: every count
-- in it is a bug unless it is 0.
--
-- 20261009130000_invoicing_schema.sql dropped appointments.billed_price_cents and
-- invoices.total_cents, so the appointment-cache invariants and the old section 4 (stored invoice
-- total drift) are gone: there is no cache or stored total left to drift. Every column read below
-- exists both before and after that migration, so the script runs against either schema.
--
-- It is one statement on purpose. The Supabase CLI sends a file to the server as a single prepared
-- statement, so a script split into several SELECTs fails with 'cannot insert multiple commands into
-- a prepared statement'. The sections are therefore one UNION ALL over a shared
-- label/subject/detail/before/after/delta shape, each section labelling its own rows.
--
-- This file must never gain a statement that writes. Rounding mirrors src/lib/pricing/money.ts --
-- round once, per line, half away from zero, which is what JavaScript's Math.round does for the
-- non-negative amounts this schema allows.

WITH "job_reinterpretation" AS (
    -- Every job: what it charged per visit, and what the same number now charges across its
    -- estimated duration. A job with no estimate is listed with NULLs rather than dropped -- it is
    -- still repriced, it just cannot be previewed here.
    SELECT
        1 AS "section",
        round("j"."hourly_rate_cents" * "j"."estimated_duration_minutes" / 60.0)::bigint - "j"."hourly_rate_cents" AS "delta_cents",
        "j"."name" AS "tiebreak",
        '1. job rate reinterpretation' AS "label",
        "j"."name" AS "subject",
        'estimated ' || COALESCE("j"."estimated_duration_minutes"::text, 'unknown') || ' min  ·  ' || "j"."id"::text AS "detail",
        "j"."hourly_rate_cents"::bigint AS "before_cents",
        round("j"."hourly_rate_cents" * "j"."estimated_duration_minutes" / 60.0)::bigint AS "after_cents"
    FROM "public"."jobs" "j"
), "live_appointment" AS (
    -- Every appointment still priced live, i.e. with no live (unreleased) invoice line. is_archived
    -- is nullable on this table, so the filter has to COALESCE rather than say NOT.
    SELECT
        "a"."id",
        "a"."scheduled_date",
        "j"."name" AS "job_name",
        COALESCE("a"."price_override_cents", "j"."hourly_rate_cents")::bigint AS "old_price_cents",
        COALESCE(
            "a"."price_override_cents",
            round("j"."hourly_rate_cents" * (EXTRACT(EPOCH FROM ("a"."scheduled_end_time" - "a"."scheduled_start_time")) / 60) / 60.0)::integer
        )::bigint AS "new_price_cents"
    FROM "public"."appointments" "a"
    JOIN "public"."jobs" "j" ON ("j"."id" = "a"."job_id")
    WHERE NOT EXISTS (SELECT 1 FROM "public"."invoice_appointments" "ia" WHERE "ia"."appointment_id" = "a"."id" AND "ia"."is_archived" = false)
        AND COALESCE("a"."is_archived", false) = false
), "appointment_repricing" AS (
    SELECT
        2 AS "section",
        "l"."new_price_cents" - "l"."old_price_cents" AS "delta_cents",
        "l"."scheduled_date"::text AS "tiebreak",
        '2. un-invoiced appointment repricing' AS "label",
        "l"."id"::text AS "subject",
        "l"."scheduled_date"::text || '  ·  ' || "l"."job_name" AS "detail",
        "l"."old_price_cents" AS "before_cents",
        "l"."new_price_cents" AS "after_cents"
    FROM "live_appointment" "l"
), "appointment_repricing_summary" AS (
    -- The same set in one line, for the reader who only wants the magnitude.
    SELECT
        3 AS "section",
        -- sum() over bigint returns numeric, and the CLI renders numeric as a raw pgtype struct
        -- rather than a number. Every value column in this report is therefore cast to bigint.
        COALESCE(sum("l"."new_price_cents" - "l"."old_price_cents"), 0)::bigint AS "delta_cents",
        '' AS "tiebreak",
        '2b. un-invoiced repricing summary' AS "label",
        'appointments repriced' AS "subject",
        count(*)::text || ' affected' AS "detail",
        COALESCE(sum("l"."old_price_cents"), 0)::bigint AS "before_cents",
        COALESCE(sum("l"."new_price_cents"), 0)::bigint AS "after_cents"
    FROM "live_appointment" "l"
), "invariant" AS (
    -- Each of these must be 0. A non-zero count means the backfill did not do what the migration
    -- claims, and nothing downstream should be trusted until it reads 0 again.
    --
    -- A draft's lines carry no amount from 20261009130000 on, so only non-draft lines must have one.
    SELECT 'non-draft junction rows with no billed amount' AS "subject", count(*) AS "offending"
    FROM "public"."invoice_appointments" "ia"
    JOIN "public"."invoices" "inv" ON ("inv"."id" = "ia"."invoice_id")
    WHERE "ia"."billed_amount_cents" IS NULL
        AND "inv"."status" <> 'draft'
    UNION ALL
    SELECT 'junction rows with rate xor minutes', count(*)
    FROM "public"."invoice_appointments" "ia"
    WHERE ("ia"."billed_rate_cents" IS NULL) <> ("ia"."billed_minutes" IS NULL)
    UNION ALL
    SELECT 'jobs with a negative rate', count(*)
    FROM "public"."jobs" "j"
    WHERE "j"."hourly_rate_cents" < 0
), "invariant_report" AS (
    SELECT
        4 AS "section",
        NULL::bigint AS "delta_cents",
        "i"."subject" AS "tiebreak",
        '3. invariant (must be 0)' AS "label",
        "i"."subject",
        "i"."offending"::text || CASE WHEN "i"."offending" = 0 THEN ' (ok)' ELSE ' <-- MUST BE 0' END AS "detail",
        NULL::bigint AS "before_cents",
        "i"."offending"::bigint AS "after_cents"
    FROM "invariant" "i"
), "report" AS (
    SELECT * FROM "job_reinterpretation"
    UNION ALL
    SELECT * FROM "appointment_repricing"
    UNION ALL
    SELECT * FROM "appointment_repricing_summary"
    UNION ALL
    SELECT * FROM "invariant_report"
)
SELECT
    "r"."label",
    "r"."subject",
    "r"."detail",
    "r"."before_cents",
    "r"."after_cents",
    "r"."delta_cents"
FROM "report" "r"
ORDER BY "r"."section", abs("r"."delta_cents") DESC NULLS LAST, "r"."tiebreak";
