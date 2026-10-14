import type { InvoiceStatus } from "../invoices/view.ts";
import type { AppointmentStatus } from "./lifecycle.ts";

// Which visits a scoped cancel or delete touches and which it skips. Pure: the SQL functions
// re-check under lock, so this feeds the preview and the ids sent, never the final counts.

// Same values as the appointment form's edit_scope.
export type AppointmentScope = "occurrence" | "future" | "series";
export type ScopeAction = "cancel" | "delete";

export const NOT_IN_SERIES_ERROR = "This appointment isn't part of a series.";

export type ScopeOutcome<T> =
  | { value: T; error: null }
  | { value: null; error: string };

export type ChosenVisit = {
  id: string;
  scheduled_date: string;
  recurrence_series_id: string | null;
};

// An invoice_appointments row. isLive: neither archived (released) nor cancelled, a Live claim.
export type ScopeLine = {
  invoiceStatus: InvoiceStatus;
  isLive: boolean;
};

export type ScopeCandidate = {
  id: string;
  scheduled_date: string;
  status: AppointmentStatus;
  is_archived: boolean;
  lines: ScopeLine[];
};

export type SkipReason = "paid_invoice";
export type SkippedVisit = { id: string; reason: SkipReason };

export type ScopePlan = {
  actIds: string[];
  skipped: SkippedVisit[];
};

function byDateThenId(a: ScopeCandidate, b: ScopeCandidate): number {
  return (
    a.scheduled_date.localeCompare(b.scheduled_date) || a.id.localeCompare(b.id)
  );
}

function isInScope(
  scope: AppointmentScope,
  chosen: ChosenVisit,
  candidate: ScopeCandidate,
): boolean {
  if (candidate.is_archived) return false;
  if (scope === "occurrence") return candidate.id === chosen.id;
  if (scope === "future") return candidate.scheduled_date >= chosen.scheduled_date;
  return true;
}

// The unarchived visits the scope covers, by date, before the action leaves any out or skips any.
export function selectVisitsInScope(
  scope: AppointmentScope,
  chosen: ChosenVisit,
  candidates: ScopeCandidate[],
): ScopeOutcome<ScopeCandidate[]> {
  if (scope !== "occurrence" && chosen.recurrence_series_id === null) {
    return { value: null, error: NOT_IN_SERIES_ERROR };
  }

  const inScope = candidates
    .filter((candidate) => isInScope(scope, chosen, candidate))
    .sort(byDateThenId);
  return { value: inScope, error: null };
}

// A paid invoice's total must never change: cancel is refused by the status trigger only for a
// Live claim, but a delete would cascade any line off the invoice, Cancelled or released too.
function isOnPaidInvoice(action: ScopeAction, visit: ScopeCandidate): boolean {
  return visit.lines.some(
    (line) =>
      line.invoiceStatus === "paid" && (action === "delete" || line.isLive),
  );
}

export function planScope(
  action: ScopeAction,
  scope: AppointmentScope,
  chosen: ChosenVisit,
  candidates: ScopeCandidate[],
): ScopeOutcome<ScopePlan> {
  const selected = selectVisitsInScope(scope, chosen, candidates);
  if (selected.error !== null) return selected;

  // Cancelling a cancelled visit changes nothing, so it is neither acted on nor reported.
  const actionable = selected.value.filter(
    (visit) => action === "delete" || visit.status !== "cancelled",
  );
  return {
    value: {
      actIds: actionable
        .filter((visit) => !isOnPaidInvoice(action, visit))
        .map((visit) => visit.id),
      skipped: actionable
        .filter((visit) => isOnPaidInvoice(action, visit))
        .map((visit) => ({ id: visit.id, reason: "paid_invoice" })),
    },
    error: null,
  };
}
