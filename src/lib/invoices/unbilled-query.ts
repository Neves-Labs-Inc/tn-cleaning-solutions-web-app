import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { scopeToClient } from "./client-scope.ts";

// The Unbilled appointment rule, kept free of `server-only` so node:test can load the reads that
// build on it (queries.ts, payment-state-queries.ts).

type Db = SupabaseClient<Database>;

// "No Live claim" as a PostgREST anti-join: embed only the visit's Live claims, then keep the rows
// where that embed is empty. It runs in the database, so no id list travels in the URL.
export const LIVE_CLAIM_EMBED = "live:invoice_appointments ( appointment_id )";

// Completed after launch and still completed (completed_at isn't cleared when a visit is reopened),
// not archived, no Live claim. Unpriced visits are included and tagged.
export function unbilledQuery(
  db: Db,
  columns: string,
  options: { clientId: string | null; isCount: boolean },
) {
  const query = db
    .from("appointments")
    .select(
      `${columns}, ${LIVE_CLAIM_EMBED}`,
      options.isCount ? { count: "exact", head: true } : undefined,
    )
    .eq("live.is_archived", false)
    .is("live.cancelled_at", null)
    .is("live", null)
    .not("completed_at", "is", null)
    .eq("status", "completed")
    .eq("is_archived", false);
  return scopeToClient(query, "client_id", options.clientId);
}
