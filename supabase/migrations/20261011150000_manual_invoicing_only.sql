-- Invoices are made by hand: Automatic invoicing goes off for every client and by default.
--
-- Client issue #103; map #105 (Franklin approved deleting the Automatic drafts at charting);
-- CONTEXT.md "Automatic invoicing", "Excluded appointment", "Unbilled appointment".
--
-- CONTRACT
--
--   * clients.automatic_invoicing defaults to false, and every existing client is set to false.
--     The per-client switch still works: turning it on brings back the 20261009140000 behaviour.
--   * Every Automatic draft (is_automatic and status 'draft'), open or archived, is deleted. Its
--     lines go by ON DELETE CASCADE, so its appointments become Unbilled again. They are deleted
--     directly, not through invoice_archive, which would make the appointments Excluded. Manual
--     drafts and every issued, paid or void invoice (Automatic or not) are untouched.
--   * appointments.excluded_from_automatic is false on every row: with the switch off nowhere, an
--     Excluded appointment is just an Unbilled one.
--   * The appointments_invoicing trigger, invoice_join_automatic_draft and the Excluded rules in
--     invoice_update_draft and invoice_archive stay as they are. They are dormant until a client's
--     switch is turned back on.
--
-- Only rows that change are updated, so set_updated_at doesn't touch the rest. The appointments
-- update doesn't fire appointments_invoicing (its column list doesn't include this flag).
--
-- DOWN. Destructive: the deleted Automatic drafts and their lines can't be restored, and which
-- clients had the switch on and which appointments were Excluded isn't recorded. Restore the
-- default and the comment only:
--
--   ALTER TABLE "public"."clients" ALTER COLUMN "automatic_invoicing" SET DEFAULT true;
--   COMMENT ON COLUMN "public"."clients"."automatic_invoicing" IS 'Automatic invoicing: the client''s completed visits join an Automatic draft. Turning it off leaves an open Automatic draft as it is.';


-- 1. Automatic drafts ----------------------------------------------------------------------------

DELETE FROM "public"."invoices"
WHERE "is_automatic" AND "status" = 'draft';


-- 2. Excluded appointments -----------------------------------------------------------------------

UPDATE "public"."appointments"
SET "excluded_from_automatic" = false
WHERE "excluded_from_automatic";


-- 3. clients.automatic_invoicing -----------------------------------------------------------------

ALTER TABLE "public"."clients"
    ALTER COLUMN "automatic_invoicing" SET DEFAULT false;

UPDATE "public"."clients"
SET "automatic_invoicing" = false
WHERE "automatic_invoicing";

COMMENT ON COLUMN "public"."clients"."automatic_invoicing" IS 'Automatic invoicing: the client''s completed visits join an Automatic draft. Off by default: invoices are made by hand. Turning it off leaves an open Automatic draft as it is.';
