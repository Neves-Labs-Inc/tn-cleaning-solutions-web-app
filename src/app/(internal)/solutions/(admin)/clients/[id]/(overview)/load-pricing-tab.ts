import type { SupabaseClient } from "@supabase/supabase-js";

import type { PricingJob } from "@/components/admin/client-job-pricing-form";
import type { ClientJobPricingRow } from "@/lib/clients/pricing-view";
import type { Database } from "@/types/database";

export type PricingTabData = {
  rows: ClientJobPricingRow[];
  // Active jobs, for the add/edit form's job picker.
  jobs: PricingJob[];
};

type PricingQueryRow = {
  id: string;
  job_id: string;
  hourly_rate_cents: number;
  effective_from: string;
  notes: string | null;
  is_archived: boolean;
  jobs: { name: string } | { name: string }[];
};

function toPricingRow(row: PricingQueryRow): ClientJobPricingRow {
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;

  return {
    id: row.id,
    job_id: row.job_id,
    job_name: job?.name ?? "",
    hourly_rate_cents: row.hourly_rate_cents,
    effective_from: row.effective_from,
    notes: row.notes,
    is_archived: row.is_archived,
  };
}

// The client's rates and the active jobs. Null when either fails: the form can't open without jobs.
export async function loadPricingTab(
  supabase: SupabaseClient<Database>,
  clientId: string,
): Promise<PricingTabData | null> {
  const [pricing, jobs] = await Promise.all([
    supabase
      .from("client_job_pricing")
      .select(
        "id, job_id, hourly_rate_cents, effective_from, notes, is_archived, jobs!inner(name)",
      )
      .eq("client_id", clientId)
      .order("effective_from", { ascending: false }),
    supabase
      .from("jobs")
      .select("id, name, hourly_rate_cents")
      .eq("is_archived", false)
      .order("name"),
  ]);

  const error = pricing.error ?? jobs.error;
  if (error) {
    console.error("Failed to load pricing for client", clientId, error);
  }
  return error
    ? null
    : {
        // The embed's shape isn't inferred from the select string, so it is typed here.
        rows: ((pricing.data ?? []) as PricingQueryRow[]).map(toPricingRow),
        jobs: jobs.data ?? [],
      };
}
