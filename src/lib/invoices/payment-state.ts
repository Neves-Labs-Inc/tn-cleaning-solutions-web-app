import type { AppointmentStatus } from "@/lib/appointments/lifecycle";

// Payment state (CONTEXT.md): where an appointment stands with billing. Pure, so node:test and
// client components can both load it.

export type PaymentState = "unbilled" | "billed" | "paid";

// The invoice behind an appointment's Live claim: a line that isn't archived or cancelled, on an
// invoice that isn't void. A draft has no number yet.
export type PaymentClaim = {
  id: string;
  number: string | null;
  status: "draft" | "issued" | "paid";
};

type PaymentStateInput = {
  status: AppointmentStatus;
  claim: PaymentClaim | null;
};

// A completed appointment with no Live claim is Unbilled, whenever it was completed.
export function paymentStateOf({
  status,
  claim,
}: PaymentStateInput): PaymentState | null {
  let state: PaymentState | null = null;
  if (claim) {
    state = claim.status === "paid" ? "paid" : "billed";
  } else if (status === "completed") {
    state = "unbilled";
  }
  return state;
}
