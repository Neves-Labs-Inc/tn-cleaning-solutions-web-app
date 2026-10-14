-- A Series repeats "every N days / weeks / months" instead of daily / weekly / biweekly / monthly.
--
-- CONTRACT
--   * recurrence_series.frequency is renamed to interval_unit and holds 'day' | 'week' | 'month'.
--   * recurrence_series.interval_count (integer, NOT NULL, default 1) is the N.
--   * Existing rows: biweekly becomes (week, 2); daily / weekly / monthly become (day / week / month, 1),
--     so no Series' dates move.
--   * The DB refuses an unknown unit and a count outside 1..cap, with caps day 365, week 52, month 24
--     (INTERVAL_CAPS in src/lib/appointments/recurrence.ts; keep the two in step).
--
-- DOWN
--   Lossy: a count other than 1 (or week 2) falls back to its unit's old frequency.
--   ALTER TABLE "public"."recurrence_series" DROP CONSTRAINT "recurrence_series_interval_count_check";
--   ALTER TABLE "public"."recurrence_series" DROP CONSTRAINT "recurrence_series_interval_unit_check";
--   UPDATE "public"."recurrence_series" SET "interval_unit" = CASE
--     WHEN "interval_unit" = 'week' AND "interval_count" = 2 THEN 'biweekly'
--     WHEN "interval_unit" = 'day' THEN 'daily'
--     WHEN "interval_unit" = 'week' THEN 'weekly'
--     ELSE 'monthly' END;
--   ALTER TABLE "public"."recurrence_series" DROP COLUMN "interval_count";
--   ALTER TABLE "public"."recurrence_series" RENAME COLUMN "interval_unit" TO "frequency";
--   ALTER TABLE "public"."recurrence_series" ADD CONSTRAINT "recurrence_series_frequency_check"
--     CHECK ("frequency" = ANY (ARRAY['daily'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text]));

ALTER TABLE "public"."recurrence_series" DROP CONSTRAINT "recurrence_series_frequency_check";

ALTER TABLE "public"."recurrence_series" RENAME COLUMN "frequency" TO "interval_unit";

ALTER TABLE "public"."recurrence_series"
  ADD COLUMN "interval_count" integer NOT NULL DEFAULT 1;

UPDATE "public"."recurrence_series"
SET "interval_count" = CASE WHEN "interval_unit" = 'biweekly' THEN 2 ELSE 1 END,
    "interval_unit" = CASE "interval_unit"
      WHEN 'daily' THEN 'day'
      WHEN 'weekly' THEN 'week'
      WHEN 'biweekly' THEN 'week'
      WHEN 'monthly' THEN 'month'
    END;

ALTER TABLE "public"."recurrence_series"
  ADD CONSTRAINT "recurrence_series_interval_unit_check"
  CHECK ("interval_unit" IN ('day', 'week', 'month'));

ALTER TABLE "public"."recurrence_series"
  ADD CONSTRAINT "recurrence_series_interval_count_check"
  CHECK (
    "interval_count" >= 1
    AND "interval_count" <= CASE "interval_unit"
      WHEN 'day' THEN 365
      WHEN 'week' THEN 52
      WHEN 'month' THEN 24
    END
  );
