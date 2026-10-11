-- invoice_receivables_totals(client): the Receivables figures, summed in the database.
--
-- The dashboard and Receivables used to read every invoice through PostgREST and sum in the app,
-- but a response stops at max-rows (1000), so the totals undercounted past that. This returns one
-- row, whatever the volume:
--
--   outstanding_cents   sum of total_cents over issued, unarchived invoices (what is owed)
--   overdue_cents       the same, where invoices_with_status.effective_status = 'overdue'
--   no_due_date_cents   the same, where due_date is null
--   unpaid_count        how many issued, unarchived invoices there are
--   draft_count         how many open (unarchived) drafts there are
--
-- p_client_id null means every client. No paging and no pricing: a draft's Live price is computed
-- in the app (ADR 0001), so drafts are only counted here.
--
-- SECURITY INVOKER and STABLE: it reads invoices_with_status through the caller's RLS, so a
-- non-admin gets zeros. authenticated and service_role may execute it; anon and PUBLIC may not.
--
-- DOWN. DROP FUNCTION "public"."invoice_receivables_totals"("uuid"); no data is touched.


CREATE FUNCTION "public"."invoice_receivables_totals"("p_client_id" "uuid" DEFAULT NULL)
    RETURNS TABLE (
        "outstanding_cents" bigint,
        "overdue_cents" bigint,
        "no_due_date_cents" bigint,
        "unpaid_count" integer,
        "draft_count" integer
    )
    LANGUAGE "sql" STABLE SECURITY INVOKER
    SET "search_path" TO ''
    AS $$
    SELECT
        coalesce(sum(v.total_cents) FILTER (WHERE v.status = 'issued'), 0)::bigint,
        coalesce(sum(v.total_cents) FILTER (WHERE v.effective_status = 'overdue'), 0)::bigint,
        coalesce(sum(v.total_cents) FILTER (WHERE v.status = 'issued' AND v.due_date IS NULL), 0)::bigint,
        (count(*) FILTER (WHERE v.status = 'issued'))::integer,
        (count(*) FILTER (WHERE v.status = 'draft'))::integer
    FROM "public"."invoices_with_status" v
    WHERE NOT v.is_archived
      AND v.status IN ('issued', 'draft')
      AND (p_client_id IS NULL OR v.client_id = p_client_id);
$$;

ALTER FUNCTION "public"."invoice_receivables_totals"("uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."invoice_receivables_totals"("uuid") IS 'Receivables figures for one client (or all when null): outstanding, overdue and no-due-date cents and the unpaid count over issued unarchived invoices, and the open draft count. Reads through the caller''s RLS.';

REVOKE ALL ON FUNCTION "public"."invoice_receivables_totals"("uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."invoice_receivables_totals"("uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."invoice_receivables_totals"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."invoice_receivables_totals"("uuid") TO "service_role";
