-- Scoped cancel and delete meet Payroll: a visit on a paid Pay run is skipped, and a delete
-- releases the unpaid Payroll rows that point at its sessions.
--
-- Replaces delete_appointments (20261014193700) and cancel_appointments (20261014184700); their
-- contracts still hold except as written here. CONTEXT.md "Pay run", "Deleted appointment",
-- "Cancel and delete scopes".
--
-- CONTRACT
--
--   * private.lock_paid_pay_run_visits(appointment_ids) -> uuid[]. Locks the employees rows of the
--     visits' crews FOR UPDATE in id order, then returns the visits (in id order) with a session
--     that a paid Pay run claims, or that an Adjustment on a paid run points at. The employees row
--     is the lock every Payroll write takes first (20261014231000), so no run can be finalized or
--     paid between this check and the caller's write. Callers take it after their visit locks,
--     the order correct_session_clocks uses (session, visit, Cleaner).
--   * Both functions skip such a visit with reason paid_pay_run: paid amounts are frozen, so the
--     visit and its sessions are left alone. A visit on a paid invoice keeps reason paid_invoice,
--     checked first.
--   * delete_appointments, for each visit it deletes: claims on its sessions (only an unpaid run
--     can hold one now) are deleted, so the session is simply no longer on that run, as when Mark
--     paid releases a claim; an Adjustment pointing at one of its sessions (only on an unpaid run
--     now) keeps its amount and reason and stops pointing at the session. Both before the
--     appointment goes, because their RESTRICT FKs would refuse the crew cascade.
--   * cancel_appointments leaves claims on unpaid runs alone: Mark paid releases claims on a
--     cancelled visit.
--
-- DOWN. Re-run the CREATE FUNCTION blocks of 20261014193700 and 20261014184700 with CREATE OR
-- REPLACE, then:
--
--   DROP FUNCTION "private"."lock_paid_pay_run_visits"("uuid"[]);


-- 1. lock_paid_pay_run_visits --------------------------------------------------------------------

CREATE FUNCTION "private"."lock_paid_pay_run_visits"("appointment_ids" "uuid"[]) RETURNS "uuid"[]
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
	paid_visit_ids uuid[];
BEGIN
	PERFORM employees.id
	FROM public.employees
	WHERE employees.id IN (
		SELECT appointment_employees.employee_id
		FROM public.appointment_employees
		WHERE appointment_employees.appointment_id = ANY (lock_paid_pay_run_visits.appointment_ids)
	)
	ORDER BY employees.id
	FOR UPDATE;

	-- A separate statement from the lock, so it sees every run paid while the lock waited.
	SELECT coalesce(array_agg(DISTINCT appointment_employees.appointment_id ORDER BY appointment_employees.appointment_id), '{}')
	INTO paid_visit_ids
	FROM public.appointment_employees
	WHERE appointment_employees.appointment_id = ANY (lock_paid_pay_run_visits.appointment_ids)
		AND (
			EXISTS (
				SELECT 1
				FROM public.pay_run_lines
				JOIN public.pay_runs ON pay_runs.id = pay_run_lines.pay_run_id
				WHERE pay_run_lines.appointment_employee_id = appointment_employees.id
					AND pay_runs.status = 'paid'
			)
			OR EXISTS (
				SELECT 1
				FROM public.pay_adjustments
				JOIN public.pay_runs ON pay_runs.id = pay_adjustments.pay_run_id
				WHERE pay_adjustments.appointment_employee_id = appointment_employees.id
					AND pay_runs.status = 'paid'
			)
		);

	RETURN paid_visit_ids;
END;
$$;

ALTER FUNCTION "private"."lock_paid_pay_run_visits"("uuid"[]) OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."lock_paid_pay_run_visits"("uuid"[]) FROM PUBLIC;

COMMENT ON FUNCTION "private"."lock_paid_pay_run_visits"("uuid"[]) IS 'Locks the crews'' employees rows (the Payroll lock) in id order and returns the visits with a session claimed by, or pointed at by an Adjustment on, a paid Pay run.';


-- 2. delete_appointments -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."delete_appointments"("p_appointment_ids" "uuid"[], "p_series_id" "uuid",
    "p_series_change" "text", "p_end_before" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	requested_ids uuid[] := coalesce(p_appointment_ids, '{}');
	paid_pay_run_ids uuid[];
	paid_invoice_ids uuid[];
	pay_run_skipped_ids uuid[];
	deleted_ids uuid[];
	touched_invoice_ids uuid[];
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.invoice_error('not_admin');
	END IF;

	IF p_series_change IS NULL OR p_series_change NOT IN ('none', 'end_before', 'delete') THEN
		RAISE EXCEPTION USING MESSAGE = 'Unknown series change: ' || coalesce(p_series_change, 'null'),
			ERRCODE = '22023';
	END IF;
	IF p_series_change <> 'none' AND p_series_id IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = 'A series change needs a series id.', ERRCODE = '22023';
	END IF;
	IF p_series_change = 'end_before' AND p_end_before IS NULL THEN
		RAISE EXCEPTION USING MESSAGE = 'Ending a series needs a date.', ERRCODE = '22023';
	END IF;

	-- Crew rows first, the order employee_clock and correct_session_clocks lock in; the cascade
	-- below would otherwise take them after the appointment and could deadlock a Cleaner clocking.
	PERFORM appointment_employees.id
	FROM public.appointment_employees
	WHERE appointment_employees.appointment_id = ANY (requested_ids)
	ORDER BY appointment_employees.id
	FOR UPDATE;

	PERFORM private.invoice_lock_visits(requested_ids);

	-- No line can join these visits now: every line writer locks the visit first.
	PERFORM invoices.id
	FROM public.invoices
	WHERE invoices.id IN (
		SELECT invoice_appointments.invoice_id
		FROM public.invoice_appointments
		WHERE invoice_appointments.appointment_id = ANY (requested_ids)
	)
	ORDER BY invoices.id
	FOR UPDATE;

	-- After the visits, as correct_session_clocks does: no run can be paid until this commits.
	paid_pay_run_ids := private.lock_paid_pay_run_visits(requested_ids);

	-- Separate statements from the locks, so they see everything committed while the locks waited.
	-- Any line on a paid invoice skips, Cancelled or released too: the delete would cascade it off.
	SELECT coalesce(array_agg(appointments.id ORDER BY appointments.id), '{}')
	INTO paid_invoice_ids
	FROM public.appointments
	WHERE appointments.id = ANY (requested_ids)
		AND NOT coalesce(appointments.is_archived, false)
		AND EXISTS (
			SELECT 1
			FROM public.invoice_appointments
			JOIN public.invoices ON invoices.id = invoice_appointments.invoice_id
			WHERE invoice_appointments.appointment_id = appointments.id
				AND invoices.status = 'paid'
		);

	-- Paid amounts are frozen, so a visit with a paid session stays whole.
	SELECT coalesce(array_agg(appointments.id ORDER BY appointments.id), '{}')
	INTO pay_run_skipped_ids
	FROM public.appointments
	WHERE appointments.id = ANY (paid_pay_run_ids)
		AND NOT coalesce(appointments.is_archived, false)
		AND appointments.id <> ALL (paid_invoice_ids);

	SELECT coalesce(array_agg(appointments.id ORDER BY appointments.id), '{}')
	INTO deleted_ids
	FROM public.appointments
	WHERE appointments.id = ANY (requested_ids)
		AND NOT coalesce(appointments.is_archived, false)
		AND appointments.id <> ALL (paid_invoice_ids)
		AND appointments.id <> ALL (pay_run_skipped_ids);

	SELECT coalesce(array_agg(DISTINCT invoice_appointments.invoice_id), '{}')
	INTO touched_invoice_ids
	FROM public.invoice_appointments
	WHERE invoice_appointments.appointment_id = ANY (deleted_ids);

	-- Only unpaid runs point at these sessions now. Their RESTRICT FKs would refuse the crew
	-- cascade: the claim is released, the Adjustment keeps its amount without the session.
	DELETE FROM public.pay_run_lines
	WHERE pay_run_lines.appointment_employee_id IN (
		SELECT appointment_employees.id
		FROM public.appointment_employees
		WHERE appointment_employees.appointment_id = ANY (deleted_ids)
	);

	UPDATE public.pay_adjustments
	SET appointment_employee_id = NULL
	WHERE pay_adjustments.appointment_employee_id IN (
		SELECT appointment_employees.id
		FROM public.appointment_employees
		WHERE appointment_employees.appointment_id = ANY (deleted_ids)
	);

	-- Their RESTRICT FKs would refuse the crew cascade, so the audit rows go first.
	PERFORM set_config('app.deleting_appointments', 'on', true);

	DELETE FROM public.clock_corrections
	WHERE clock_corrections.appointment_employee_id IN (
		SELECT appointment_employees.id
		FROM public.appointment_employees
		WHERE appointment_employees.appointment_id = ANY (deleted_ids)
	);

	DELETE FROM public.odd_duration_acknowledgements
	WHERE odd_duration_acknowledgements.appointment_employee_id IN (
		SELECT appointment_employees.id
		FROM public.appointment_employees
		WHERE appointment_employees.appointment_id = ANY (deleted_ids)
	);

	PERFORM set_config('app.deleting_appointments', 'off', true);

	-- The appointment goes before its crew rows (by cascade): the crew trigger then finds no
	-- appointment to re-derive, so no status update can join an Automatic draft or run the cancel
	-- path. Deleting the crew first would re-derive the dying visit's status.
	DELETE FROM public.appointments
	WHERE appointments.id = ANY (deleted_ids);

	-- An archived draft's lines were all released when it was archived, so it holds no live line
	-- and would be deleted whole, other visits' lines with it; it is left as it is.
	PERFORM private.invoice_delete_if_empty(invoices.id)
	FROM public.invoices
	WHERE invoices.id = ANY (touched_invoice_ids)
		AND NOT invoices.is_archived;

	-- Nothing left to charge: void it and release its lines, as the status trigger does when an
	-- issued invoice's last line is cancelled. An issued invoice carries no Payment to clear.
	WITH emptied AS (
		UPDATE public.invoices
		SET status = 'void'
		WHERE invoices.id = ANY (touched_invoice_ids)
			AND invoices.status = 'issued'
			AND NOT EXISTS (
				SELECT 1
				FROM public.invoice_appointments
				WHERE invoice_appointments.invoice_id = invoices.id
					AND NOT invoice_appointments.is_archived
					AND invoice_appointments.cancelled_at IS NULL
			)
		RETURNING invoices.id
	)
	UPDATE public.invoice_appointments
	SET is_archived = true
	WHERE invoice_appointments.invoice_id IN (SELECT emptied.id FROM emptied)
		AND NOT invoice_appointments.is_archived;

	-- A call that deleted nothing changes nothing, so the admin's "void the invoice first" holds.
	IF cardinality(deleted_ids) > 0 THEN
		IF p_series_change = 'end_before' THEN
			UPDATE public.recurrence_series
			SET end_date = least(coalesce(recurrence_series.end_date, p_end_before - 1), p_end_before - 1)
			WHERE recurrence_series.id = p_series_id;
		ELSIF p_series_change = 'delete' THEN
			DELETE FROM public.recurrence_series
			WHERE recurrence_series.id = p_series_id;
		END IF;
	END IF;

	RETURN jsonb_build_object(
		'deleted', to_jsonb(deleted_ids),
		'skipped', coalesce(
			(SELECT jsonb_agg(jsonb_build_object('id', skipped.id, 'reason', skipped.reason) ORDER BY skipped.id)
			FROM (
				SELECT paid_invoice.id, 'paid_invoice' AS reason FROM unnest(paid_invoice_ids) AS paid_invoice(id)
				UNION ALL
				SELECT paid_run.id, 'paid_pay_run' FROM unnest(pay_run_skipped_ids) AS paid_run(id)
			) AS skipped),
			'[]'::jsonb),
		'invoice_ids', to_jsonb(touched_invoice_ids)
	);
END;
$$;

COMMENT ON FUNCTION "public"."delete_appointments"("uuid"[], "uuid", "text", "date") IS 'Admin only. Permanently deletes the named unarchived visits with their crew rows, clocks, Clock corrections, Odd duration acknowledgements and invoice lines, skipping any with a line on a paid invoice (paid_invoice) or a session on a paid Pay run (paid_pay_run). Releases unpaid Pay run claims on their sessions and unlinks unpaid Adjustments. Deletes a draft left with no live line, voids an issued one, then applies the Series change (none, end_before, delete) when anything was deleted. Returns { deleted, skipped, invoice_ids }.';


-- 3. cancel_appointments -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."cancel_appointments"("p_appointment_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
	visit_id uuid;
	claim_invoice_id uuid;
	claim_invoice_status text;
	paid_pay_run_ids uuid[];
	cancelled_ids uuid[] := '{}';
	skipped jsonb := '[]'::jsonb;
	changed_invoice_ids uuid[] := '{}';
BEGIN
	IF public.get_user_role() IS DISTINCT FROM 'admin' THEN
		PERFORM public.invoice_error('not_admin');
	END IF;

	PERFORM private.invoice_lock_visits(coalesce(p_appointment_ids, '{}'));

	-- After the visits: no run can be paid until this commits.
	paid_pay_run_ids := private.lock_paid_pay_run_visits(coalesce(p_appointment_ids, '{}'));

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
		ELSIF visit_id = ANY (paid_pay_run_ids) THEN
			-- Paid amounts are frozen; cancelling would make a paid shift unpayable.
			skipped := skipped || jsonb_build_object('id', visit_id, 'reason', 'paid_pay_run');
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

COMMENT ON FUNCTION "public"."cancel_appointments"("uuid"[]) IS 'Admin only. Cancels the named appointments after locking them in id order, leaving out missing, archived and already cancelled ones and skipping any with a Live claim on a paid invoice (paid_invoice) or a session on a paid Pay run (paid_pay_run). The appointments_invoicing trigger updates their invoice lines. Returns { cancelled, skipped: [{ id, reason }], invoice_ids }.';
