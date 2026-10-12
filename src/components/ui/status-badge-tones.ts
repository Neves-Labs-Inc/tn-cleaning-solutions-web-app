// Plain .ts so node:test can load it; status-badge.tsx re-exports these, keeping
// the status-to-tone mapping next to the component (DESIGN.md §3.2, §10).
import { CheckCircle2, CircleDashed, Clock, Hourglass, Pencil, ReceiptText, UserMinus } from "lucide-react";

import type { AppointmentStatus } from '../../lib/helpers/dashboard'
import type { PaymentState } from '../../lib/invoices/payment-state'
import type { InvoiceEffectiveStatus, LineState } from '../../lib/invoices/view'
import { formatBusinessTime } from '../../lib/schedule/business-time.ts'
import type { FlagKind, SessionView } from "../../lib/time-sheets/session-view";
import type { ScheduleAppointment } from '../../lib/appointments/overview'
import type { ClockStatus, StatusBadgeSpec, StatusTone } from './status-badge'

const INVOICE_STATUS_BADGES: Record<InvoiceEffectiveStatus, StatusBadgeSpec> = {
  draft: { tone: 'neutral', label: 'Draft' },
  issued: { tone: 'info', label: 'Issued' },
  overdue: { tone: 'warning', label: 'Overdue' },
  paid: { tone: 'success', label: 'Paid' },
  void: { tone: 'danger', label: 'Void' },
}

const LINE_STATE_BADGES: Record<LineState, StatusBadgeSpec | null> = {
  ok: null,
  unpriced: { tone: 'warning', label: 'Unpriced' },
  upcoming: { tone: 'info', label: 'Upcoming' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
}

const APPOINTMENT_STATUS_BADGES: Record<AppointmentStatus, StatusBadgeSpec> = {
  scheduled: { tone: 'info', label: 'Scheduled' },
  in_progress: { tone: 'success', label: 'In Progress' },
  completed: { tone: 'neutral', label: 'Completed' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
}

// Icon plus label on every state, so it never rests on colour alone.
const PAYMENT_STATE_BADGES: Record<PaymentState, StatusBadgeSpec> = {
  unbilled: { tone: 'warning', label: 'Unbilled', icon: CircleDashed },
  billed: { tone: 'info', label: 'Billed', icon: ReceiptText },
  paid: { tone: 'success', label: 'Paid', icon: CheckCircle2 },
}

// A scheduled appointment an hour past its end. Same icon as Not started / Open shift: time passed.
export const NOT_CLOCKED_BADGE: StatusBadgeSpec = { tone: 'danger', label: 'Not clocked', icon: Clock }

export const ARCHIVED_BADGE: StatusBadgeSpec = { tone: 'neutral', label: 'Archived' }

// A draft line whose total was set by hand. Informational, like the time sheets' Edited pill.
export const OVERRIDDEN_BADGE: StatusBadgeSpec = { tone: 'neutral', label: 'Overridden', icon: Pencil }

export function invoiceStatusBadge(status: InvoiceEffectiveStatus): StatusBadgeSpec {
  return INVOICE_STATUS_BADGES[status]
}

export function lineStateBadge(state: LineState): StatusBadgeSpec | null {
  return LINE_STATE_BADGES[state]
}

export function appointmentStatusBadge(status: AppointmentStatus): StatusBadgeSpec {
  return APPOINTMENT_STATUS_BADGES[status]
}

// The status pill every appointment surface paints; nothing else picks the label.
export function appointmentDisplayBadge(status: AppointmentStatus, isNotClocked: boolean): StatusBadgeSpec {
  return isNotClocked ? NOT_CLOCKED_BADGE : appointmentStatusBadge(status)
}

// The one place that decides an appointment card's tint (DESIGN.md §3.2). Not clocked wins over the
// Payment state; Cancelled is never tinted.
export function appointmentCardTone(
  appointment: Pick<ScheduleAppointment, 'status' | 'isNotClocked' | 'paymentState'>,
): StatusTone | null {
  if (appointment.status === 'cancelled') return null
  if (appointment.isNotClocked) return 'danger'
  if (appointment.paymentState === null) return null
  return PAYMENT_STATE_BADGES[appointment.paymentState].tone
}

export function paymentStateBadge(state: PaymentState): StatusBadgeSpec {
  return PAYMENT_STATE_BADGES[state]
}

export function clockStatusBadge(
  status: ClockStatus,
  clockedInAt: string | null,
  clockedOutAt: string | null,
): StatusBadgeSpec {
  const specs: Record<ClockStatus, StatusBadgeSpec> = {
    not_started: { tone: 'warning', label: 'Not started', icon: Clock },
    clocked_in: {
      tone: 'success',
      label: clockedInAt ? `Clocked in at ${formatBusinessTime(new Date(clockedInAt))}` : 'Clocked in',
      icon: CheckCircle2,
    },
    clocked_out: {
      tone: 'neutral',
      label: clockedOutAt ? `Clocked out at ${formatBusinessTime(new Date(clockedOutAt))}` : 'Clocked out',
    },
  }
  return specs[status]
}

// The Active / Inactive pill on client and location rows.
export function activeStateBadge(isActive: boolean): StatusBadgeSpec {
  return isActive ? { tone: 'success', label: 'Active' } : { tone: 'neutral', label: 'Inactive' }
}

type InvoiceFlagRow = {
  effective_status: InvoiceEffectiveStatus
  is_automatic: boolean
  is_archived: boolean
  has_unpriced?: boolean
}

// The pills an invoice row wears, in fixed order: status, Automatic, Archived, Unpriced. Every
// invoice screen renders these through InvoiceBadges, so no page builds its own.
export function invoiceFlagBadges(row: InvoiceFlagRow): StatusBadgeSpec[] {
  const badges: Array<StatusBadgeSpec | null> = [
    invoiceStatusBadge(row.effective_status),
    row.is_automatic ? { tone: 'neutral', label: 'Automatic' } : null,
    row.is_archived ? ARCHIVED_BADGE : null,
    row.has_unpriced ? lineStateBadge('unpriced') : null,
  ]
  return badges.filter((badge) => badge !== null)
}

type TimeSheetBadgeView = Pick<
  SessionView,
  | "state"
  | "flags"
  | "oddRatioPercent"
  | "isAcknowledged"
  | "isManualCompletion"
  | "isEdited"
  | "isRemoved"
  | "fixAction"
>;

// A Removed session (a Cleaner taken off the crew after it had history), on the admin and the
// Cleaner Time sheets alike. The pill, not the strike-through, is what says it.
export const REMOVED_SESSION_BADGE: StatusBadgeSpec = {
  tone: "neutral",
  label: "Removed",
  icon: UserMinus,
};

// A Removed session's clocked time and In/Out times, struck through and muted. Line-through is
// not announced, so pair the struck duration with a visually hidden ", not counted".
export const REMOVED_VALUE_CLASSES = "line-through decoration-muted-foreground/60 text-muted-foreground";

// An upcoming session is offered Add session once its scheduled start passes (fixAction "add"),
// so from then on the badge stops promising a future visit.
function upcomingBadge(view: TimeSheetBadgeView): StatusBadgeSpec | null {
  if (view.state !== "upcoming") return null;

  const label = view.fixAction === "add" ? "Not clocked in" : "Upcoming";
  return { tone: "info", label };
}

// The per-kind tone, icon and plain label; the Odd duration pill adds its ratio in a session row.
export const TIME_SHEET_FLAG_SPECS: Record<FlagKind, StatusBadgeSpec> = {
  open_shift: { tone: "warning", label: "Open shift", icon: Clock },
  missing_clock: { tone: "danger", label: "Missing clock", icon: CircleDashed },
  odd_duration: { tone: "warning", label: "Odd duration", icon: Hourglass },
};

function timeSheetFlagBadge(flag: FlagKind, oddRatioPercent: number | null): StatusBadgeSpec {
  const spec = TIME_SHEET_FLAG_SPECS[flag];
  return flag === "odd_duration" ? { ...spec, label: `Odd duration · ${oddRatioPercent}%` } : spec;
}

// The pills a session wears, in fixed order: its flags, In progress or Upcoming (Not clocked in
// once due), an acknowledged Odd duration, Manual completion, Edited. A Removed session swaps
// everything before its history pills for Removed. Admin screens only: Cleaners never see flags.
export function timeSheetFlagBadges(view: TimeSheetBadgeView): StatusBadgeSpec[] {
  const liveBadges: Array<StatusBadgeSpec | null> = [
    ...view.flags.map((flag) => timeSheetFlagBadge(flag, view.oddRatioPercent)),
    view.state === "in_progress" ? { tone: "success", label: "In progress" } : null,
    upcomingBadge(view),
  ];
  const badges: Array<StatusBadgeSpec | null> = [
    ...(view.isRemoved ? [REMOVED_SESSION_BADGE] : liveBadges),
    view.isAcknowledged
      ? { tone: "neutral", label: "Odd duration · OK'd", icon: CheckCircle2 }
      : null,
    view.isManualCompletion ? { tone: "neutral", label: "Manual completion" } : null,
    view.isEdited ? { tone: "neutral", label: "Edited", icon: Pencil } : null,
  ];
  return badges.filter((badge) => badge !== null);
}
