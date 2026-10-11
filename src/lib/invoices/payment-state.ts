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
  completed_at: string | null;
  claim: PaymentClaim | null;
};

// completed_at is only set for completions after launch, so an older completed appointment with
// no claim has no state rather than counting as Unbilled.
export function paymentStateOf({
  status,
  completed_at,
  claim,
}: PaymentStateInput): PaymentState | null {
  let state: PaymentState | null = null;
  if (claim) {
    state = claim.status === "paid" ? "paid" : "billed";
  } else if (status === "completed" && completed_at !== null) {
    state = "unbilled";
  }
  return state;
}
