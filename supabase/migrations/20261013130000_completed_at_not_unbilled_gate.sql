-- Unbilled no longer depends on appointments.completed_at.
--
-- CONTRACT
--   * Only the column comment on appointments.completed_at changes. The column and its stamp
--     trigger (appointments_stamp_completed_at) stay. A completed, non-archived appointment with no
--     Live claim is Unbilled whatever its completed_at (CONTEXT.md "Unbilled appointment").
--
-- DOWN
--   COMMENT ON COLUMN "public"."appointments"."completed_at" IS 'When the status last became completed, stamped by the invoicing trigger. Null on visits completed before launch, so "completed after launch" = not null.';

COMMENT ON COLUMN "public"."appointments"."completed_at" IS 'When the status last became completed, stamped by the invoicing trigger. Null on visits completed before 2026-10-09; not used to decide Unbilled.';
