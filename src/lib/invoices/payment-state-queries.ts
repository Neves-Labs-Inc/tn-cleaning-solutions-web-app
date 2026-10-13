import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import {
  APPOINTMENT_PRICE_COLUMNS,
  type PriceableAppointment,
} from "../pricing/index.ts";
import { inBatches, priceAppointmentsInBatches, readAllPagesByIds } from "./batch.ts";
import type { PaymentClaim } from "./payment-state.ts";
import { unbilledQuery } from "./unbilled-query.ts";

// Payment state reads. Admin pages only: they read client names and invoice numbers. No
// `server-only` import, so node:test can load this file; call these from server code only.
// Read failures throw.

type Db = SupabaseClient<Database>;

// An Unbilled appointment on the Needs billing list. livePriceCents is null when Unpriced.
export type NeedsBillingAppointment = {
  id: string;
  clientId: string;
  clientName: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  jobId: string;
  jobName: string;
  livePriceCents: number | null;
};

type ClaimRow = {
  appointment_id: string;
  invoice: { id: string; status: string; invoice_number: string | null };
};

// A Live claim: the line isn't archived (released) or cancelled, and its invoice isn't void.
export async function loadClaims(
  db: Db,
  appointmentIds: string[],
): Promise<Map<string, PaymentClaim>> {
  const claims = new Map<string, PaymentClaim>();

  // Batched so a long id list doesn't overflow the request URL.
  for (const batch of inBatches(appointmentIds)) {
    const { data, error } = await db
      .from("invoice_appointments")
      .select("appointment_id, invoice:invoices!inner ( id, status, invoice_number )")
      .in("appointment_id", batch)
      .eq("is_archived", false)
      .is("cancelled_at", null)
      .neq("invoice.status", "void");
    if (error) throw error;

    for (const row of data as unknown as ClaimRow[]) {
      claims.set(row.appointment_id, {
        id: row.invoice.id,
        number: row.invoice.invoice_number,
        // The void filter above leaves only these three statuses.
        status: row.invoice.status as PaymentClaim["status"],
      });
    }
  }

  return claims;
}

export type AppointmentClaim = {
  claim: PaymentClaim | null;
  // The invoice's total of Billed amounts (invoices_with_status); a draft's is 0, as it has none.
  totalCents: number | null;
};

// One appointment's Live claim and its invoice's total, for the appointment page.
export async function getAppointmentClaim(
  db: Db,
  appointmentId: string,
): Promise<AppointmentClaim> {
  const claim = (await loadClaims(db, [appointmentId])).get(appointmentId) ?? null;
  if (!claim) return { claim: null, totalCents: null };

  const { data, error } = await db
    .from("invoices_with_status")
    .select("total_cents")
    .eq("id", claim.id)
    .maybeSingle();
  if (error) throw error;

  return { claim, totalCents: data?.total_cents ?? null };
}

type NeedsBillingRow = PriceableAppointment & {
  jobs: { name: string } | null;
  clients: { name: string } | null;
};

// pricing_job is the price module's own Job embed, so `jobs` stays free for the name.
const NEEDS_BILLING_COLUMNS = `${APPOINTMENT_PRICE_COLUMNS}, jobs ( name ), clients ( name )`;

// Every Unbilled appointment in every month, oldest first; with ids, only those of them that are
// Unbilled. Paged past PostgREST's row cap, in an order with a unique last key so no row shifts
// between pages.
export async function listNeedsBilling(
  db: Db,
  ids: string[] | null = null,
): Promise<NeedsBillingAppointment[]> {
  const rows = (await readAllPagesByIds(ids, (idBatch, from, to) => {
    const unbilled = unbilledQuery(db, NEEDS_BILLING_COLUMNS, { clientId: null, isCount: false });
    const scoped = idBatch === null ? unbilled : unbilled.in("id", idBatch);
    return scoped
      .order("scheduled_date", { ascending: true })
      .order("scheduled_start_time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
  })) as unknown as NeedsBillingRow[];
  const prices = await priceAppointmentsInBatches(db, rows);

  return rows.map((row) => {
    const live = prices.get(row.id)?.live;
    return {
      id: row.id,
      clientId: row.client_id,
      clientName: row.clients?.name ?? "Unknown client",
      scheduledDate: row.scheduled_date,
      startTime: row.scheduled_start_time,
      endTime: row.scheduled_end_time,
      jobId: row.job_id,
      jobName: row.jobs?.name ?? "Unknown job",
      livePriceCents: live && live.source !== "unpriced" ? live.amount_cents : null,
    };
  });
}
