import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type {
  AppointmentScope,
  ScopeOutcome,
  SkippedVisit,
} from "./appointment-scope.ts";
import { loadScopePlan } from "./scope-changes.ts";

// Scoped cancel: plan the ids from a read, then cancel_appointments re-checks each under lock.
// No `server-only` import, so node:test can load it; call it from server code only. Database
// failures and SQL refusals (not_admin) throw.

type Db = SupabaseClient<Database>;

export type CancelRequest = {
  appointmentId: string;
  scope: AppointmentScope;
};

export type CancelOutcome = {
  cancelledIds: string[];
  skipped: SkippedVisit[];
  // Invoices whose line changed, so their pages can be revalidated.
  invoiceIds: string[];
};

// cancel_appointments' jsonb answer (20261014184700 CONTRACT).
type CancelRpcAnswer = {
  cancelled: string[];
  skipped: SkippedVisit[];
  invoice_ids: string[];
};

const NOTHING_CANCELLED: CancelRpcAnswer = {
  cancelled: [],
  skipped: [],
  invoice_ids: [],
};

function mergeSkipped(
  planned: SkippedVisit[],
  locked: SkippedVisit[],
): SkippedVisit[] {
  const plannedIds = new Set(planned.map((visit) => visit.id));
  return [...planned, ...locked.filter((visit) => !plannedIds.has(visit.id))];
}

async function callCancelAppointments(
  db: Db,
  ids: string[],
): Promise<CancelRpcAnswer> {
  const { data, error } = await db.rpc("cancel_appointments", {
    p_appointment_ids: ids,
  });
  if (error) throw error;
  return data as unknown as CancelRpcAnswer;
}

export async function cancelInScope(
  db: Db,
  request: CancelRequest,
): Promise<ScopeOutcome<CancelOutcome>> {
  const loaded = await loadScopePlan(db, { ...request, action: "cancel" });
  if (loaded.error !== null) return loaded;

  const { plan } = loaded.value;
  // Nothing actionable: the planner's skips are the whole answer, no round trip needed.
  const answer =
    plan.actIds.length === 0
      ? NOTHING_CANCELLED
      : await callCancelAppointments(db, plan.actIds);
  return {
    value: {
      cancelledIds: answer.cancelled,
      skipped: mergeSkipped(plan.skipped, answer.skipped),
      invoiceIds: answer.invoice_ids,
    },
    error: null,
  };
}
