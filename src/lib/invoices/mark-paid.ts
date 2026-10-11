import { format, parseISO } from "date-fns";

import type { AppointmentStatus } from "@/lib/appointments/lifecycle";
import type { PaymentClaim } from "./payment-state.ts";

// What the Mark paid dialog needs per appointment. Every one belongs to the same client.
export type MarkPaidAppointment = {
  id: string;
  scheduledDate: string;
  jobName: string;
  status: AppointmentStatus;
  // null when Unpriced.
  livePriceCents: number | null;
  claim: PaymentClaim | null;
  // The claim's invoice total; the Record payment mode shows it for an issued claim.
  claimTotalCents: number | null;
};

const NOTES = {
  draft: "Comes off its draft invoice; the rest of the draft stays",
  upcoming: "Not done yet: billed as an Upcoming line (prepayment)",
  unpriced: "Unpriced: type the amount",
  none: "Live price",
};

// An appointment on an issued invoice is paid through that invoice, never marked paid again.
export function isRecordPayment(appointments: MarkPaidAppointment[]): boolean {
  return appointments.length === 1 && appointments[0].claim?.status === "issued";
}

// Each note that applies, in a fixed order; "Live price" when none does.
export function markPaidNotes(appointment: MarkPaidAppointment): string[] {
  const notes = [
    appointment.claim?.status === "draft" ? NOTES.draft : null,
    appointment.status !== "completed" ? NOTES.upcoming : null,
    appointment.livePriceCents === null ? NOTES.unpriced : null,
  ].filter((note) => note !== null);
  return notes.length > 0 ? notes : [NOTES.none];
}

// "Tue, Oct 7", with the year only when it isn't the Business date's.
export function appointmentDateLabel(
  scheduledDate: string,
  businessDate: string,
): string {
  const isThisYear = scheduledDate.slice(0, 4) === businessDate.slice(0, 4);
  return format(parseISO(scheduledDate), isThisYear ? "EEE, MMM d" : "EEE, MMM d, yyyy");
}

// The amount input's prefill: the Live price in dollars, blank when Unpriced.
export function amountInputValue(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}
