import type { PricedAppointment } from "./index.ts";
import { formatCents } from "./money.ts";

// Spelled out (not UNPRICED_LABEL's dash) because it reads inside a sentence.
const UNPRICED_WORD = "Unpriced";

// A Billing mismatch: the appointment shows a Billed amount (issued or paid invoice) and was edited
// since, so its Live price is Unpriced or a different amount. Returns that Live price for display,
// or null when there is no mismatch. A draft line has no Billed amount, so it never mismatches.
export function billingMismatchLiveLabel({
  live,
  display,
}: PricedAppointment): string | null {
  if (display.source !== "billed") return null;

  let label: string | null = null;
  if (live.source === "unpriced") {
    label = UNPRICED_WORD;
  } else if (live.amount_cents !== display.amount_cents) {
    label = formatCents(live.amount_cents);
  }
  return label;
}
