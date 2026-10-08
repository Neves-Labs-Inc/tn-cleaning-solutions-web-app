-- invoices_with_status derives "overdue" from today's date in America/New_York.
--
-- The snapshot (20260427000000_schema_snapshot.sql:262-279) marked an issued invoice overdue when
-- due_date < CURRENT_DATE. CURRENT_DATE follows the Postgres session time zone, which is UTC on
-- Supabase, so the admin invoices list flipped invoices to overdue at 8 PM Eastern (7 PM in
-- winter), a day before the business considered them late. The business runs on Eastern time, so
-- "today" is computed in that zone, inside the view, where the rule already lives.
--
-- CONTRACT -- the column list is identical to the snapshot, so src/types/database.ts does not
-- change. The only difference is the overdue test:
--
--   status = 'issued' AND due_date < (now() AT TIME ZONE 'America/New_York')::date -> 'overdue'
--
-- which no longer depends on the session time zone. Every other status is passed through as
-- before. security_invoker stays on (20261004120000 explains why the employee-facing views carry
-- it; this one did from the snapshot). Owner and comment are restated; grants are untouched by
-- CREATE OR REPLACE VIEW and remain as the snapshot left them.
--
-- DOWN. CREATE OR REPLACE the view with the body from the snapshot (lines 262-279 of that file,
-- the same owner and comment). No data is touched either way: the view is computed.


CREATE OR REPLACE VIEW "public"."invoices_with_status" WITH ("security_invoker"='true') AS
 SELECT "id",
    "client_id",
    "status",
    "issued_date",
    "due_date",
    "total_cents",
    "notes",
    "created_at",
    "updated_at",
    "is_archived",
        CASE
            WHEN (("status" = 'issued'::"text") AND ("due_date" < ("now"() AT TIME ZONE 'America/New_York')::"date")) THEN 'overdue'::"text"
            ELSE "status"
        END AS "effective_status"
   FROM "public"."invoices" "i";


ALTER VIEW "public"."invoices_with_status" OWNER TO "postgres";


COMMENT ON VIEW "public"."invoices_with_status" IS 'Invoices with computed effective_status field. Overdue is derived from due_date < today in America/New_York when status = issued.';
