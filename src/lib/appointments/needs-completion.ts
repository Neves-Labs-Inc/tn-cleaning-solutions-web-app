import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import {
  inBatches,
  priceAppointmentsInBatches,
  readAllPages,
} from "../invoices/batch.ts";
import {
  APPOINTMENT_PRICE_COLUMNS,
  type DisplayPrice,
  type PriceableAppointment,
} from "../pricing/index.ts";
import { getBusinessDate } from "../schedule/business-time.ts";
import { isNotClocked } from "./overview.ts";

// The Needs completion view's read and its bulk Mark complete. Admin pages only: the read
// returns client names. No `server-only` import, so node:test can load it; call it from server
// code only. Database failures throw.

type Db = SupabaseClient<Database>;

// A Not clocked appointment. priceCents is the displayed price, null when Unpriced.
export type NeedsCompletionAppointment = {
  id: string;
  clientId: string;
  clientName: string;
  jobId: string;
  jobName: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  priceCents: number | null;
};

// failed: ids never reached because a later batch's request failed after earlier ones committed.
export type CompletionResult = {
  completed: string[];
  skipped: string[];
  failed: string[];
};

type NeedsCompletionRow = PriceableAppointment & {
  clients: { name: string } | null;
  jobs: { name: string } | null;
};

// pricing_job is the price module's own Job embed, so `jobs` stays free for the name.
const NEEDS_COMPLETION_COLUMNS = `${APPOINTMENT_PRICE_COLUMNS}, clients ( name ), jobs ( name )`;

function displayedCents(display: DisplayPrice | undefined): number | null {
  return display && display.source !== "unpriced"
    ? display.amount_cents
    : null;
}

// Every Not clocked appointment in every month, oldest first. Prices are read in batches, never
// per row.
export async function listNeedsCompletion(
  db: Db,
  now: Date,
): Promise<NeedsCompletionAppointment[]> {
  // A visit can't pass its grace end before its own day starts, so later days are never read.
  const businessDate = getBusinessDate(now);

  // Paged in an order with a unique last key so no row shifts between pages.
  const scheduled = (await readAllPages((from, to) =>
    db
      .from("appointments")
      .select(NEEDS_COMPLETION_COLUMNS)
      .eq("is_archived", false)
      .eq("status", "scheduled")
      .lte("scheduled_date", businessDate)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_start_time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  )) as unknown as NeedsCompletionRow[];
  const rows = scheduled.filter((row) =>
    isNotClocked(
      {
        status: "scheduled",
        scheduledDate: row.scheduled_date,
        endTime: row.scheduled_end_time,
      },
      now,
    ),
  );
  const prices = await priceAppointmentsInBatches(db, rows);

  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    clientName: row.clients?.name ?? "Unknown client",
    jobId: row.job_id,
    jobName: row.jobs?.name ?? "Unknown job",
    scheduledDate: row.scheduled_date,
    startTime: row.scheduled_start_time,
    endTime: row.scheduled_end_time,
    priceCents: displayedCents(prices.get(row.id)?.display),
  }));
}

// Marks each still-Not-clocked visit complete the way the single Mark complete does: the flag
// only, so the trigger derives `completed` and stamps completed_at. A visit someone clocked into,
// cancelled, completed or archived since the list loaded fails the conditions and is skipped.
// Throws when nothing committed; once a batch has, a later failure is reported in `failed`.
export async function completeAppointments(
  db: Db,
  ids: string[],
): Promise<CompletionResult> {
  const requested = [...new Set(ids)];
  const completed: string[] = [];
  const attempted: string[] = [];

  // Batched so a long selection doesn't overflow the request URL. Batches aren't one
  // transaction, so a failure stops here and leaves the committed ones done.
  for (const batch of inBatches(requested)) {
    const { data, error } = await db
      .from("appointments")
      .update({ manually_completed: true })
      .in("id", batch)
      .eq("is_archived", false)
      .eq("status", "scheduled")
      .eq("manually_completed", false)
      .select("id");
    if (error && attempted.length === 0) throw error;
    if (error) {
      console.error("completeAppointments: batch failed after others committed", {
        code: error.code,
        message: error.message,
        completedCount: completed.length,
      });
      break;
    }

    attempted.push(...batch);
    completed.push(...data.map((row) => row.id));
  }

  const completedIds = new Set(completed);
  const attemptedIds = new Set(attempted);
  const skipped = attempted.filter((id) => !completedIds.has(id));
  const failed = requested.filter((id) => !attemptedIds.has(id));
  return { completed, skipped, failed };
}
