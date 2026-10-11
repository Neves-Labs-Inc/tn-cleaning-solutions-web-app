import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppointmentStatus } from "@/lib/appointments/lifecycle";
import {
  priceAppointments,
  type DisplayPrice,
  type PriceableAppointment,
} from "@/lib/pricing";
import type { Database } from "@/types/database";
import { InvoiceLedger, type PaymentMethod } from "./ledger";
import { paymentStateOf, type PaymentClaim, type PaymentState } from "./payment-state";
import { getAppointmentClaim } from "./payment-state-queries";

// What the appointment page's Billing card shows. Admin pages only.

type Db = SupabaseClient<Database>;

// The card's price line: the Billed amount when there is one (issued or paid claim), else the
// Live price. A pricing failure shows as unavailable without hiding the rest of the card.
export type BillingPrice =
  | { kind: "amount"; cents: number; isBilledAmount: boolean }
  | { kind: "unpriced" }
  | { kind: "unavailable" };

export type AppointmentBilling = {
  state: PaymentState | null;
  claim: PaymentClaim | null;
  claimTotalCents: number | null;
  price: BillingPrice;
  // null when Unpriced or unavailable; Mark paid prefills from it.
  livePriceCents: number | null;
  // Every method, hidden ones included, for the payment sheet's Method field.
  methods: PaymentMethod[];
};

type BillingAppointment = PriceableAppointment & {
  status: AppointmentStatus;
  completed_at: string | null;
};

type PriceLoad = { price: BillingPrice; livePriceCents: number | null };

const UNAVAILABLE: PriceLoad = { price: { kind: "unavailable" }, livePriceCents: null };

function toBillingPrice(display: DisplayPrice): BillingPrice {
  let price: BillingPrice;
  if (display.source === "unpriced") {
    price = { kind: "unpriced" };
  } else {
    price = {
      kind: "amount",
      cents: display.amount_cents,
      isBilledAmount: display.source === "billed",
    };
  }
  return price;
}

async function loadPrice(db: Db, appointment: BillingAppointment): Promise<PriceLoad> {
  let load: PriceLoad;

  try {
    const priced = (await priceAppointments(db, [appointment])).get(appointment.id);
    const live = priced?.live;
    load = priced
      ? {
          price: toBillingPrice(priced.display),
          livePriceCents: live && live.source !== "unpriced" ? live.amount_cents : null,
        }
      : UNAVAILABLE;
  } catch (thrown) {
    console.error("Error pricing appointment for billing:", appointment.id, thrown);
    load = UNAVAILABLE;
  }

  return load;
}

async function loadMethods(db: Db): Promise<PaymentMethod[]> {
  const result = await new InvoiceLedger(db).listPaymentMethods();
  if (!result.ok) throw new Error(`Couldn't load payment methods: ${result.message}`);
  return result.data;
}

// Read on its own, like the crew: null when the claim or methods can't be read, so the card shows
// its error and the rest of the page still renders.
export async function loadAppointmentBilling(
  db: Db,
  appointment: BillingAppointment,
): Promise<AppointmentBilling | null> {
  let billing: AppointmentBilling | null;

  try {
    const [{ claim, totalCents }, methods, priceLoad] = await Promise.all([
      getAppointmentClaim(db, appointment.id),
      loadMethods(db),
      loadPrice(db, appointment),
    ]);
    billing = {
      state: paymentStateOf({
        status: appointment.status,
        completed_at: appointment.completed_at,
        claim,
      }),
      claim,
      claimTotalCents: totalCents,
      methods,
      ...priceLoad,
    };
  } catch (thrown) {
    console.error("Error loading appointment billing:", appointment.id, thrown);
    billing = null;
  }

  return billing;
}
