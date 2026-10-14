-- Scoped cancel: cancel a set of appointments (this visit, this and following, or a whole Series)
-- in one transaction, skipping any whose Live claim is on a paid invoice.
--
-- ADR docs/adr/0001-invoice-writes-in-sql-functions-and-status-trigger.md; CONTEXT.md "Live
-- claim", "Series". The app plans the ids from a read (planScope); this function re-checks each
-- one under lock, so its answer, not the plan, is what the admin is told.
--
-- CONTRACT
--
--   cancel_appointments(p_appointment_ids uuid[]) -> jsonb
--     { "cancelled": [uuid], "skipped": [{ "id": uuid, "reason": "paid_invoice" }],
--       "invoice_ids": [uuid] }
--     SECURITY DEFINER, search_path = '', owner postgres, one transaction.
--
--   * Refuses not_admin through invoice_error when get_user_role() isn't admin.
--   * Locks the named appointments FOR UPDATE in id order first (private.invoice_lock_visits), the
--     same order every invoice write uses.
--   * Per id, in id order: missing, archived or already cancelled -> left out silently. A Live
--     claim on a paid invoice -> skipped with reason paid_invoice (the status trigger would refuse
--     it). Otherwise status becomes cancelled.
--   * The appointments_invoicing trigger (20261009140000) does the billing: a draft line is
--     dropped (an emptied draft deleted), an issued line becomes Cancelled and an issued invoice
--     left with nothing to charge is voided. invoice_ids lists the invoices that held a Live
--     claim on a cancelled visit, so the caller can revalidate their pages; a deleted draft's id
--     is listed too.
--   * Never touches recurrence_series.
--
-- anon keeps EXECUTE through GRANT ALL like the invoice functions (revoking it crashes the Supabase
-- image, see 20260917120000); the function refuses not_admin itself.
--
-- DOWN.
--
--   DROP FUNCTION "public"."cancel_appointments"("uuid"[]);
--
-- No data changes; cancelled appointments stay cancelled and can be restored one by one.

CREATE FUNCTION "public"."cancel_appointments"("p_appointment_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	visit_id uuid;
	claim_invoice_id uuid;
	claim_invoice_status text;
	cancelled_ids uuid[] := '{}';
	skipped jsonb := '[]'::jsonb;
	changed_invoice_ids uuid[] := '{}';
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.invoice_error('not_admin');
	END IF;

	PERFORM private.invoice_lock_visits(coalesce(p_appointment_ids, '{}'));

	-- A separate statement after the lock, so its snapshot sees every claim committed meanwhile.
	FOR visit_id IN
		SELECT appointments.id
		FROM public.appointments
		WHERE appointments.id = ANY (p_appointment_ids)
			AND NOT coalesce(appointments.is_archived, false)
			AND appointments.status <> 'cancelled'
		ORDER BY appointments.id
	LOOP
		claim_invoice_id := NULL;
		claim_invoice_status := NULL;

		SELECT invoices.id, invoices.status
		INTO claim_invoice_id, claim_invoice_status
		FROM public.invoice_appointments
		JOIN public.invoices ON invoices.id = invoice_appointments.invoice_id
		WHERE invoice_appointments.appointment_id = visit_id
			AND NOT invoice_appointments.is_archived
			AND invoice_appointments.cancelled_at IS NULL;

		IF claim_invoice_status = 'paid' THEN
			-- A paid invoice's total must never change; the admin voids it first.
			skipped := skipped || jsonb_build_object('id', visit_id, 'reason', 'paid_invoice');
		ELSE
			UPDATE public.appointments
			SET status = 'cancelled'
			WHERE appointments.id = visit_id;

			cancelled_ids := cancelled_ids || visit_id;
			IF claim_invoice_id IS NOT NULL AND NOT claim_invoice_id = ANY (changed_invoice_ids) THEN
				changed_invoice_ids := changed_invoice_ids || claim_invoice_id;
			END IF;
		END IF;
	END LOOP;

	RETURN jsonb_build_object(
		'cancelled', to_jsonb(cancelled_ids),
		'skipped', skipped,
		'invoice_ids', to_jsonb(changed_invoice_ids)
	);
END;
$$;

ALTER FUNCTION "public"."cancel_appointments"("uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."cancel_appointments"("uuid"[]) IS 'Admin only. Cancels the named appointments after locking them in id order, leaving out missing, archived and already cancelled ones and skipping any with a Live claim on a paid invoice. The appointments_invoicing trigger updates their invoice lines. Returns { cancelled, skipped: [{ id, reason }], invoice_ids }.';

GRANT ALL ON FUNCTION "public"."cancel_appointments"("uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_appointments"("uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_appointments"("uuid"[]) TO "service_role";
