-- The schema every invoicing function and screen stands on.
--
-- Decisions #62 (numbering, payment, archive), #63 (counter, derived total, grants, error
-- contract), #54 (automatic_invoicing); ADR docs/adr/0001-invoice-writes-in-sql-functions-and-
-- status-trigger.md; CONTEXT.md "Invoicing" terms. There are no production invoices, so stored
-- columns that become derived are dropped, not migrated.
--
-- CONTRACT
--
--   * clients.automatic_invoicing: the client's completed visits join an Automatic draft. On by
--     default.
--   * appointments.completed_at: stamped by the invoicing trigger (ticket 05) when the status
--     becomes completed; "completed after launch" = not null. appointments.excluded_from_automatic:
--     an Excluded visit, which never rejoins an Automatic draft. appointments.billed_price_cents is
--     dropped: nothing reads it since ticket 01, and the Billed amount lives on the line.
--   * invoices: total_cents is dropped (derived in invoices_with_status). New: invoice_number
--     (unique, null exactly while draft), is_automatic, and the Payment (paid_date,
--     payment_method, payment_reference; date and method present exactly while paid). An issued,
--     paid or void invoice has an issued_date and a draft has none; due_date is never before it.
--     At most one Automatic draft per client: invoices_one_automatic_draft. is_archived becomes
--     NOT NULL, because a NULL would slip past that index's "not is_archived" predicate.
--   * invoice_appointments: billed_amount_cents is null while the line sits on a draft (drafts
--     store no price). cancelled_at marks a Cancelled line: it charges nothing and is not a Live
--     claim, so the live-claim index now skips it as well as released rows.
--   * payment_methods: the admin-managed Payment method list, seeded in order. Admin-only RLS.
--   * invoice_number_counters: one shared count per year. RLS on and no policy: only SECURITY
--     DEFINER functions touch it.
--   * business_date(): today's Business date (Eastern). invoice_error(code): the one place every
--     invoice refusal is raised, MESSAGE = readable text, DETAIL = code, ERRCODE P0001. Its CASE
--     block is the code list src/lib/invoices/errors.ts mirrors; keep it one CASE so a regex can
--     read it.
--   * invoices_with_status: every invoices column, total_cents = sum of the uncancelled lines'
--     billed_amount_cents (0 when none), and effective_status ('overdue' when issued and
--     due_date < business_date()). Released lines count only on a void invoice, so it keeps
--     showing its original total (Franklin, 2026-10-09); every other status counts unreleased
--     lines only. Receivables treat void as $0 by filtering on status.
--   * anon loses every privilege on invoices, invoice_appointments, invoices_with_status,
--     payment_methods and invoice_number_counters. authenticated also has none on
--     invoice_number_counters: RLS doesn't cover TRUNCATE, and only SECURITY DEFINER functions
--     owned by postgres touch it. Elsewhere authenticated and service_role keep ALL; RLS still
--     decides what authenticated can touch.
--
-- The view is dropped and recreated (not replaced) because it depends on invoices.total_cents and
-- its column list changes. Its grants are restated below.
--
-- DOWN. Destructive both ways for the columns this drops or adds; no production invoice data
-- exists. Run in this order:
--
--   DROP VIEW "public"."invoices_with_status";
--   DROP FUNCTION "public"."invoice_error"("text");
--   DROP TABLE "public"."invoice_number_counters";
--   DROP TABLE "public"."payment_methods";
--   DROP INDEX "public"."invoice_appointments_live_appointment_id_idx";
--   CREATE UNIQUE INDEX "invoice_appointments_live_appointment_id_idx"
--       ON "public"."invoice_appointments" ("appointment_id") WHERE ("is_archived" = false);
--   ALTER TABLE "public"."invoice_appointments" DROP COLUMN "cancelled_at";
--   UPDATE "public"."invoice_appointments" SET "billed_amount_cents" = 0 WHERE "billed_amount_cents" IS NULL;
--   ALTER TABLE "public"."invoice_appointments" ALTER COLUMN "billed_amount_cents" SET NOT NULL;
--   DROP INDEX "public"."invoices_one_automatic_draft";
--   ALTER TABLE "public"."invoices"
--       DROP CONSTRAINT "invoices_number_iff_issued_check",
--       DROP CONSTRAINT "invoices_payment_iff_paid_check",
--       DROP CONSTRAINT "invoices_due_not_before_issue_check",
--       DROP CONSTRAINT "invoices_issued_date_iff_issued_check",
--       DROP COLUMN "invoice_number", DROP COLUMN "is_automatic", DROP COLUMN "paid_date",
--       DROP COLUMN "payment_method", DROP COLUMN "payment_reference",
--       ALTER COLUMN "is_archived" DROP NOT NULL,
--       ADD COLUMN "total_cents" integer NOT NULL DEFAULT 0;
--   ALTER TABLE "public"."invoices" ALTER COLUMN "total_cents" DROP DEFAULT;
--   ALTER TABLE "public"."appointments"
--       DROP COLUMN "completed_at", DROP COLUMN "excluded_from_automatic",
--       ADD COLUMN "billed_price_cents" integer;
--   ALTER TABLE "public"."clients" DROP COLUMN "automatic_invoicing";
--   -- then recreate invoices_with_status from 20261008130000 (inlining
--   -- (now() AT TIME ZONE 'America/New_York')::date), DROP FUNCTION "public"."business_date"(),
--   -- and restore the snapshot grants: GRANT ALL ON TABLE invoices, invoice_appointments,
--   -- invoices_with_status TO anon, authenticated, service_role.


-- 1. clients -------------------------------------------------------------------------------------

ALTER TABLE "public"."clients"
    ADD COLUMN "automatic_invoicing" boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN "public"."clients"."automatic_invoicing" IS 'Automatic invoicing: the client''s completed visits join an Automatic draft. Turning it off leaves an open Automatic draft as it is.';


-- 2. appointments --------------------------------------------------------------------------------

ALTER TABLE "public"."appointments"
    ADD COLUMN "completed_at" timestamp with time zone,
    ADD COLUMN "excluded_from_automatic" boolean NOT NULL DEFAULT false,
    DROP COLUMN "billed_price_cents";

COMMENT ON COLUMN "public"."appointments"."completed_at" IS 'When the status last became completed, stamped by the invoicing trigger. Null on visits completed before launch, so "completed after launch" = not null.';

COMMENT ON COLUMN "public"."appointments"."excluded_from_automatic" IS 'Excluded visit: an admin removed it from an Automatic draft, so it never rejoins one. It can still be billed on a manual invoice.';


-- 3. invoices ------------------------------------------------------------------------------------

-- The view reads total_cents, so it goes before the column does.
DROP VIEW "public"."invoices_with_status";

UPDATE "public"."invoices" SET "is_archived" = false WHERE "is_archived" IS NULL;

ALTER TABLE "public"."invoices"
    DROP COLUMN "total_cents",
    ALTER COLUMN "is_archived" SET NOT NULL,
    ADD COLUMN "invoice_number" "text" UNIQUE,
    ADD COLUMN "is_automatic" boolean NOT NULL DEFAULT false,
    ADD COLUMN "paid_date" "date",
    ADD COLUMN "payment_method" "text",
    ADD COLUMN "payment_reference" "text",
    -- Drafts have no number; issued, paid and void invoices keep theirs forever.
    ADD CONSTRAINT "invoices_number_iff_issued_check"
        CHECK ((("status" = 'draft'::"text") = ("invoice_number" IS NULL))),
    ADD CONSTRAINT "invoices_payment_iff_paid_check"
        CHECK ((("status" = 'paid'::"text") = (("paid_date" IS NOT NULL) AND ("payment_method" IS NOT NULL)))),
    ADD CONSTRAINT "invoices_due_not_before_issue_check"
        CHECK ((("due_date" IS NULL) OR ("issued_date" IS NULL) OR ("due_date" >= "issued_date"))),
    ADD CONSTRAINT "invoices_issued_date_iff_issued_check"
        CHECK ((("status" <> 'draft'::"text") = ("issued_date" IS NOT NULL)));

CREATE UNIQUE INDEX "invoices_one_automatic_draft"
    ON "public"."invoices" ("client_id")
 WHERE ("is_automatic" AND ("status" = 'draft'::"text") AND (NOT "is_archived"));

COMMENT ON INDEX "public"."invoices_one_automatic_draft" IS 'A client has at most one open Automatic draft. Issuing or archiving it lets the next completion start a new one.';

COMMENT ON COLUMN "public"."invoices"."invoice_number" IS 'Invoice number, e.g. INV-042-SMI2026. Set when issued, never changed or reused. Null exactly while draft.';

COMMENT ON COLUMN "public"."invoices"."is_automatic" IS 'Automatic draft: completed visits of this client join it. Never set on an invoice an admin made.';

COMMENT ON COLUMN "public"."invoices"."payment_method" IS 'Payment method name, from payment_methods. Present exactly while paid, with paid_date.';


-- 4. invoice_appointments ------------------------------------------------------------------------

ALTER TABLE "public"."invoice_appointments"
    ALTER COLUMN "billed_amount_cents" DROP NOT NULL,
    ADD COLUMN "cancelled_at" timestamp with time zone;

DROP INDEX "public"."invoice_appointments_live_appointment_id_idx";

CREATE UNIQUE INDEX "invoice_appointments_live_appointment_id_idx"
    ON "public"."invoice_appointments" ("appointment_id")
 WHERE (("is_archived" = false) AND ("cancelled_at" IS NULL));

COMMENT ON INDEX "public"."invoice_appointments_live_appointment_id_idx" IS 'An appointment has at most one Live claim. Released rows (is_archived) and Cancelled lines (cancelled_at) claim nothing.';

COMMENT ON COLUMN "public"."invoice_appointments"."billed_amount_cents" IS 'Billed amount: the charge frozen on this line when the invoice was issued. Null while the line sits on a draft. Never recomputed from current rates.';

COMMENT ON COLUMN "public"."invoice_appointments"."cancelled_at" IS 'Cancelled line: the visit was cancelled after the invoice was issued. It charges nothing and is not a Live claim; it stays as a record of what the client was first billed.';


-- 5. payment_methods -----------------------------------------------------------------------------

CREATE TABLE "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "name" "text" NOT NULL UNIQUE,
    "is_hidden" boolean NOT NULL DEFAULT false,
    "sort_order" integer NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT "now"()
);

ALTER TABLE "public"."payment_methods" OWNER TO "postgres";

COMMENT ON TABLE "public"."payment_methods" IS 'Payment methods the admin manages. A new method typed in while recording a Payment joins the list.';

INSERT INTO "public"."payment_methods" ("name", "sort_order") VALUES
    ('e-Transfer', 1),
    ('Cash', 2),
    ('Cheque', 3),
    ('Credit card', 4);

ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select payment_methods" ON "public"."payment_methods" FOR SELECT TO "authenticated"
    USING ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));

CREATE POLICY "Admin insert payment_methods" ON "public"."payment_methods" FOR INSERT TO "authenticated"
    WITH CHECK ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));

CREATE POLICY "Admin update payment_methods" ON "public"."payment_methods" FOR UPDATE TO "authenticated"
    USING ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"))
    WITH CHECK ((( SELECT "public"."get_user_role"() AS "get_user_role") = 'admin'::"text"));


-- 6. invoice_number_counters ---------------------------------------------------------------------

CREATE TABLE "public"."invoice_number_counters" (
    "year" integer NOT NULL PRIMARY KEY,
    "last_value" integer NOT NULL DEFAULT 0
);

ALTER TABLE "public"."invoice_number_counters" OWNER TO "postgres";

COMMENT ON TABLE "public"."invoice_number_counters" IS 'The Invoice number count, shared by every invoice and restarting each January. No policy on purpose: only SECURITY DEFINER invoice functions read or bump it.';

ALTER TABLE "public"."invoice_number_counters" ENABLE ROW LEVEL SECURITY;


-- 7. Helpers -------------------------------------------------------------------------------------

CREATE FUNCTION "public"."business_date"() RETURNS "date"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
	SELECT (now() AT TIME ZONE 'America/New_York')::date;
$$;

ALTER FUNCTION "public"."business_date"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."business_date"() IS 'Business date: today in Eastern time, whatever the session time zone.';


CREATE FUNCTION "public"."invoice_error"("code" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    -- VOLATILE (the default) on purpose: a constant-folded call would raise at plan time.
    SET "search_path" TO 'public'
    AS $$
DECLARE
	error_message text;
BEGIN
	error_message := CASE code
		WHEN 'not_admin' THEN 'Only an admin can change invoices.'
		WHEN 'invoice_not_found' THEN 'Invoice not found.'
		WHEN 'invalid_status' THEN 'This invoice can''t do that in its current status.'
		WHEN 'archived_invoice' THEN 'This invoice is archived. Unarchive it first.'
		WHEN 'draft_changed' THEN 'The draft changed since you opened it. Reload it and try again.'
		WHEN 'unpriced_line' THEN 'Every line needs a price before the invoice can be issued.'
		WHEN 'empty_lines' THEN 'An invoice needs at least one line.'
		WHEN 'due_before_issue' THEN 'The due date can''t be before the issue date.'
		WHEN 'paid_date_future' THEN 'The paid date can''t be in the future.'
		WHEN 'method_required' THEN 'Choose how the invoice was paid.'
		WHEN 'visit_claimed' THEN 'A visit is already on another invoice.'
		WHEN 'visit_cancelled' THEN 'A cancelled visit can''t be invoiced.'
		WHEN 'visit_other_client' THEN 'Every visit must belong to the invoice''s client.'
		WHEN 'invoice_paid' THEN 'This visit is on a paid invoice. Void the invoice first.'
		WHEN 'invoice_issued' THEN 'This visit is on an issued invoice. Void the invoice first.'
	END;

	-- A typo in a caller's code must fail loudly, not raise a blank message.
	IF error_message IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = 'Unknown invoice error: ' || coalesce(code, 'null'),
			DETAIL = 'unknown_invoice_error', ERRCODE = 'P0001';
	END IF;

	RAISE EXCEPTION USING MESSAGE = error_message, DETAIL = code, ERRCODE = 'P0001';
END;
$$;

ALTER FUNCTION "public"."invoice_error"("code" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_error"("code" "text") IS 'Raises an invoice refusal: MESSAGE is readable, DETAIL is the code. The CASE block is the code list src/lib/invoices/errors.ts mirrors.';


-- 8. invoices_with_status ------------------------------------------------------------------------

CREATE VIEW "public"."invoices_with_status" WITH ("security_invoker"='true') AS
 SELECT "i"."id",
    "i"."client_id",
    "i"."status",
    "i"."issued_date",
    "i"."due_date",
    "i"."notes",
    "i"."created_at",
    "i"."updated_at",
    "i"."is_archived",
    "i"."invoice_number",
    "i"."is_automatic",
    "i"."paid_date",
    "i"."payment_method",
    "i"."payment_reference",
    COALESCE(( SELECT "sum"("ia"."billed_amount_cents")
           FROM "public"."invoice_appointments" "ia"
          WHERE (("ia"."invoice_id" = "i"."id") AND ("ia"."cancelled_at" IS NULL) AND (("ia"."is_archived" = false) OR ("i"."status" = 'void'::"text")))), 0)::integer AS "total_cents",
        CASE
            WHEN (("i"."status" = 'issued'::"text") AND ("i"."due_date" < "public"."business_date"())) THEN 'overdue'::"text"
            ELSE "i"."status"
        END AS "effective_status"
   FROM "public"."invoices" "i";

ALTER VIEW "public"."invoices_with_status" OWNER TO "postgres";

COMMENT ON VIEW "public"."invoices_with_status" IS 'Invoices with derived total_cents (uncancelled lines; released lines count only on a void invoice, so it keeps its original total) and effective_status (overdue when issued and due_date < business_date()).';


-- 9. Grants --------------------------------------------------------------------------------------

REVOKE ALL ON TABLE "public"."invoices" FROM "anon";
REVOKE ALL ON TABLE "public"."invoice_appointments" FROM "anon";
REVOKE ALL ON TABLE "public"."invoices_with_status" FROM "anon";
REVOKE ALL ON TABLE "public"."payment_methods" FROM "anon";
REVOKE ALL ON TABLE "public"."invoice_number_counters" FROM "anon";

GRANT ALL ON TABLE "public"."invoices_with_status" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices_with_status" TO "service_role";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";
REVOKE ALL ON TABLE "public"."invoice_number_counters" FROM "authenticated";
GRANT ALL ON TABLE "public"."invoice_number_counters" TO "service_role";
