import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import {
  listNeedsBilling,
  type NeedsBillingAppointment,
} from "../invoices/payment-state-queries.ts";
import { listScheduleAppointmentsByIds } from "./month-appointments.ts";
import {
  listNeedsCompletion,
  type NeedsCompletionAppointment,
} from "./needs-completion.ts";
import type { ScheduleAppointment } from "./overview.ts";

// The fresh rows for appointments a change touched, so the client cache can patch them in place
// instead of rereading every week. Admin pages only: it reads client names. No `server-only`
// import, so node:test can load it; call it from server code only. Read failures throw.

type Db = SupabaseClient<Database>;

export type AppointmentChanges = {
  // Every id asked about: the cache drops these rows before inserting the ones returned.
  ids: string[];
  // The ones that still exist (not archived or deleted), as the week read shows them.
  schedule: ScheduleAppointment[];
  // Only the ones on Needs billing now.
  needsBilling: NeedsBillingAppointment[];
  // Only the ones on Needs completion now.
  needsCompletion: NeedsCompletionAppointment[];
};

export async function listAppointmentChanges(
  db: Db,
  ids: string[],
  now: Date,
): Promise<AppointmentChanges> {
  const [schedule, needsBilling, needsCompletion] = await Promise.all([
    listScheduleAppointmentsByIds(db, ids, now),
    listNeedsBilling(db, ids),
    listNeedsCompletion(db, now, ids),
  ]);
  return { ids, schedule, needsBilling, needsCompletion };
}
