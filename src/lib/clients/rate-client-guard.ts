import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../../types/database.ts";
import { getEditRefusal } from "./archived-client.ts";

const RATE_NOT_FOUND_MESSAGE = "Pricing rule not found.";

export type RateTarget = { clientId: string } | { pricingId: string };

// The refusal message, or null when the rate's client can be edited. Throws if the lookup fails. A rate is found by its id;
// a new rate names its client directly.
export async function getRateEditRefusal(
  db: SupabaseClient<Database>,
  target: RateTarget,
): Promise<string | null> {
  if ("clientId" in target) return getEditRefusal(db, target.clientId);

  const { data: rate, error } = await db
    .from("client_job_pricing")
    .select("client_id")
    .eq("id", target.pricingId)
    .maybeSingle();

  if (error) {
    throw new Error(`Couldn't read rate ${target.pricingId}: ${error.message}`);
  }

  let refusal: string | null;
  if (!rate) {
    refusal = RATE_NOT_FOUND_MESSAGE;
  } else {
    refusal = await getEditRefusal(db, rate.client_id);
  }
  return refusal;
}
