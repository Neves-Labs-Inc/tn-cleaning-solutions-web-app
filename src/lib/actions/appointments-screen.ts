"use server";

import { listFilterOptions } from "@/lib/appointments/filter-options";
import type { FilterOptions } from "@/lib/appointments/filters";
import { listAppointmentWeeks } from "@/lib/appointments/month-appointments";
import {
  listNeedsCompletion,
  type NeedsCompletionAppointment,
} from "@/lib/appointments/needs-completion";
import {
  parseWeeksSpan,
  type AppointmentWeeks,
} from "@/lib/appointments/weeks";
import { InvoiceLedger, type PaymentMethod } from "@/lib/invoices/ledger";
import {
  listNeedsBilling,
  type NeedsBillingAppointment,
} from "@/lib/invoices/payment-state-queries";
import { createClient } from "@/lib/supabase/server";

// The appointments screen's reads, for its client cache. Every action re-checks that the caller
// is an admin (the admin layout's rule) and THROWS on any failure: a refusal (not an admin,
// invalid input) or a failed read. A throw rejects the action's promise, which the client cache
// records as a query error. Next.js hides the message in production, so the client must not
// show it; the server log has it.

type Db = Awaited<ReturnType<typeof createClient>>;

async function requireAdminDb(action: string): Promise<Db> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (user?.app_metadata?.role !== "admin") {
    console.warn(`${action}: refused a caller who isn't an admin`, {
      userId: user?.id ?? null,
    });
    throw new Error("Unauthorized");
  }
  return db;
}

// Every week from firstWeek to lastWeek (Sunday week starts, inclusive) in one range read,
// keyed by week start. Weeks with no appointments map to an empty list.
export async function loadAppointmentWeeks(
  firstWeek: string,
  lastWeek: string,
): Promise<AppointmentWeeks> {
  const db = await requireAdminDb("loadAppointmentWeeks");
  const span = parseWeeksSpan(firstWeek, lastWeek);
  if (span === null) {
    console.warn("loadAppointmentWeeks: refused an invalid span", {
      firstWeek,
      lastWeek,
    });
    throw new Error("Invalid weeks");
  }

  return listAppointmentWeeks(db, span, new Date());
}

export async function loadNeedsBilling(): Promise<NeedsBillingAppointment[]> {
  const db = await requireAdminDb("loadNeedsBilling");
  return listNeedsBilling(db);
}

export async function loadNeedsCompletion(): Promise<
  NeedsCompletionAppointment[]
> {
  const db = await requireAdminDb("loadNeedsCompletion");
  return listNeedsCompletion(db, new Date());
}

export async function loadFilterOptions(): Promise<FilterOptions> {
  const db = await requireAdminDb("loadFilterOptions");
  return listFilterOptions(db);
}

export async function loadPaymentMethods(): Promise<PaymentMethod[]> {
  const db = await requireAdminDb("loadPaymentMethods");
  const result = await new InvoiceLedger(db).listPaymentMethods();
  // The ledger has already logged the cause.
  if (!result.ok) {
    throw new Error(`Couldn't load payment methods: ${result.message}`);
  }
  return result.data;
}
