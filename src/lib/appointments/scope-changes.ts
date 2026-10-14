import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { readAllPages } from "../invoices/batch.ts";
import type { InvoiceStatus } from "../invoices/view.ts";
import {
  planScope,
  selectVisitsInScope,
  type AppointmentScope,
  type ChosenVisit,
  type ScopeAction,
  type ScopeCandidate,
  type ScopeOutcome,
  type ScopePlan,
  type SkippedVisit,
} from "./appointment-scope.ts";
import type { AppointmentStatus } from "./lifecycle.ts";

// Scoped cancel and delete of appointments: the read of a visit's Series and the scope planner
// run over it. No `server-only` import, so node:test can load it; call it from server code only.
// Database failures throw.

type Db = SupabaseClient<Database>;

export const APPOINTMENT_NOT_FOUND_ERROR = "Appointment not found.";

export type ScopeRequest = {
  appointmentId: string;
  scope: AppointmentScope;
  action: ScopeAction;
};

// What the scoped writes need before calling their SQL function.
export type LoadedScopePlan = {
  plan: ScopePlan;
  // Unarchived visits the scope covers, before the action leaves any out or skips any.
  visitCount: number;
  chosen: ChosenVisit;
};

export type ScopePreview = {
  visitCount: number;
  actCount: number;
  skipped: SkippedVisit[];
  chosenDate: string;
  seriesId: string | null;
};

const SCOPE_COLUMNS =
  "id, scheduled_date, recurrence_series_id, status, is_archived, invoice_lines:invoice_appointments(is_archived, cancelled_at, invoices(status))";

type ScopeRow = {
  id: string;
  scheduled_date: string;
  recurrence_series_id: string | null;
  status: string;
  is_archived: boolean;
  invoice_lines: {
    is_archived: boolean;
    cancelled_at: string | null;
    invoices: { status: string } | null;
  }[];
};

function toCandidate(row: ScopeRow): ScopeCandidate {
  return {
    id: row.id,
    scheduled_date: row.scheduled_date,
    // The status and invoice status columns are checked to these values in the database.
    status: row.status as AppointmentStatus,
    is_archived: row.is_archived,
    lines: row.invoice_lines
      .filter((line) => line.invoices !== null)
      .map((line) => ({
        invoiceStatus: line.invoices?.status as InvoiceStatus,
        isLive: !line.is_archived && line.cancelled_at === null,
      })),
  };
}

async function readChosenVisit(
  db: Db,
  appointmentId: string,
): Promise<ScopeRow | null> {
  const { data, error } = await db
    .from("appointments")
    .select(SCOPE_COLUMNS)
    .eq("id", appointmentId)
    .eq("is_archived", false)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Paged in an order with a unique last key so no visit shifts between pages.
async function readSeriesVisits(
  db: Db,
  seriesId: string,
  fromDate: string | null,
): Promise<ScopeRow[]> {
  return readAllPages((from, to) => {
    const seriesVisits = db
      .from("appointments")
      .select(SCOPE_COLUMNS)
      .eq("recurrence_series_id", seriesId)
      .eq("is_archived", false);
    const dated =
      fromDate === null
        ? seriesVisits
        : seriesVisits.gte("scheduled_date", fromDate);
    return dated
      .order("scheduled_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  });
}

async function readCandidates(
  db: Db,
  scope: AppointmentScope,
  chosen: ScopeRow,
): Promise<ScopeRow[]> {
  if (scope === "occurrence" || chosen.recurrence_series_id === null) {
    return [chosen];
  }

  const fromDate = scope === "future" ? chosen.scheduled_date : null;
  return readSeriesVisits(db, chosen.recurrence_series_id, fromDate);
}

// The read-and-plan step every scoped action starts with: the chosen visit, its Series' visits
// with their invoice lines, and the planner's verdict.
export async function loadScopePlan(
  db: Db,
  request: ScopeRequest,
): Promise<ScopeOutcome<LoadedScopePlan>> {
  const chosenRow = await readChosenVisit(db, request.appointmentId);
  if (chosenRow === null) {
    return { value: null, error: APPOINTMENT_NOT_FOUND_ERROR };
  }

  const chosen: ChosenVisit = {
    id: chosenRow.id,
    scheduled_date: chosenRow.scheduled_date,
    recurrence_series_id: chosenRow.recurrence_series_id,
  };
  const candidates = (await readCandidates(db, request.scope, chosenRow)).map(
    toCandidate,
  );
  const planned = planScope(request.action, request.scope, chosen, candidates);
  if (planned.error !== null) return planned;

  const inScope = selectVisitsInScope(request.scope, chosen, candidates);
  return {
    value: {
      plan: planned.value,
      visitCount: inScope.value?.length ?? 0,
      chosen,
    },
    error: null,
  };
}

// What the confirm dialog shows before the admin commits.
export async function previewScope(
  db: Db,
  request: ScopeRequest,
): Promise<ScopeOutcome<ScopePreview>> {
  const loaded = await loadScopePlan(db, request);
  if (loaded.error !== null) return loaded;

  const { plan, visitCount, chosen } = loaded.value;
  return {
    value: {
      visitCount,
      actCount: plan.actIds.length,
      skipped: plan.skipped,
      chosenDate: chosen.scheduled_date,
      seriesId: chosen.recurrence_series_id,
    },
    error: null,
  };
}
