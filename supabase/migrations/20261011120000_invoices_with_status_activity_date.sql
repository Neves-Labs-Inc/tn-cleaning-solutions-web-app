-- invoices_with_status.activity_date: the date the invoice ledger orders by.
--
-- The ledger read the 1000 newest-created invoices (PostgREST max-rows) and reordered them in the
-- app by activity, so an old draft issued today could be missing from the page. activity_date lets
-- the query order by activity in the database, so the newest 1000 really are the newest:
--
--   activity_date = coalesce(issued_date, (created_at AT TIME ZONE 'America/New_York')::date)
--
-- That is the issue date once issued, else the Business date (Eastern, as business_date() uses for
-- effective_status) the invoice was created on. created_at is timestamptz, so the result doesn't
-- follow the session time zone. The ledger orders by activity_date desc, then created_at desc.
--
-- CONTRACT -- the view from 20261009130000 with activity_date appended as its last column (CREATE
-- OR REPLACE VIEW may only add columns at the end). security_invoker stays on. Owner and comment
-- are restated; CREATE OR REPLACE VIEW leaves the grants as 20261009130000 set them (anon none,
-- authenticated and service_role ALL). invoice_receivables_totals reads the view and is unaffected.
--
-- DOWN. DROP FUNCTION "public"."invoice_receivables_totals"("uuid") (it depends on the view),
-- DROP VIEW "public"."invoices_with_status", recreate both from 20261009130000 section 8 (with its
-- grants from section 9) and 20261010173500. No data is touched either way: the view is computed.


CREATE OR REPLACE VIEW "public"."invoices_with_status" WITH ("security_invoker"='true') AS
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
        END AS "effective_status",
    COALESCE("i"."issued_date", ("i"."created_at" AT TIME ZONE 'America/New_York'::"text")::"date") AS "activity_date"
   FROM "public"."invoices" "i";

ALTER VIEW "public"."invoices_with_status" OWNER TO "postgres";

COMMENT ON VIEW "public"."invoices_with_status" IS 'Invoices with derived total_cents (uncancelled lines; released lines count only on a void invoice, so it keeps its original total), effective_status (overdue when issued and due_date < business_date()) and activity_date (issued_date, else the Eastern created date; the ledger orders by it).';
