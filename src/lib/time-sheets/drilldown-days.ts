import { format } from "date-fns";

// Relative imports: node --test runs this file without the @/ alias.
import { formatBusinessTime } from "../schedule/business-time.ts";
import { isSameInstant, type FlagKind, type SessionState, type SessionView } from "./session-view.ts";

// The drill-down's session data, cut down to what the UI shows so client components never
// receive whole database rows.

export type HistoryCorrection = {
  id: string;
  correctedByName: string;
  correctedAt: string;
  oldClockIn: string | null;
  oldClockOut: string | null;
  newClockIn: string | null;
  newClockOut: string | null;
  reason: string | null;
};

export type HistoryAcknowledgement = {
  id: string;
  acknowledgedByName: string;
  acknowledgedAt: string;
  note: string;
  // Its snapshot no longer matches the session's current clocks.
  isLapsed: boolean;
};

export type SessionRowView = {
  id: string;
  clientName: string;
  jobName: string;
  scheduledWindow: string;
  clockIn: string | null;
  clockOut: string | null;
  clockedMinutes: number | null;
  // The inputs timeSheetFlagBadges reads.
  state: SessionState;
  flags: FlagKind[];
  oddRatioPercent: number | null;
  isAcknowledged: boolean;
  isManualCompletion: boolean;
  isEdited: boolean;
  // Newest first.
  corrections: HistoryCorrection[];
  acknowledgements: HistoryAcknowledgement[];
};

export type DrilldownDay = {
  date: string;
  label: string;
  sessions: SessionRowView[];
};

export function toSessionRowView(view: SessionView): SessionRowView {
  return {
    id: view.assignmentId,
    clientName: view.clientName,
    jobName: view.jobName,
    scheduledWindow: `${formatBusinessTime(new Date(view.scheduledStart))}–${formatBusinessTime(new Date(view.scheduledEnd))}`,
    clockIn: view.clockIn,
    clockOut: view.clockOut,
    clockedMinutes: view.clockedMinutes,
    state: view.state,
    flags: view.flags,
    oddRatioPercent: view.oddRatioPercent,
    isAcknowledged: view.isAcknowledged,
    isManualCompletion: view.isManualCompletion,
    isEdited: view.isEdited,
    corrections: view.corrections.map((item) => ({
      id: item.id,
      correctedByName: item.corrected_by_name,
      correctedAt: item.corrected_at,
      oldClockIn: item.old_clock_in,
      oldClockOut: item.old_clock_out,
      newClockIn: item.new_clock_in,
      newClockOut: item.new_clock_out,
      reason: item.reason,
    })),
    acknowledgements: view.acknowledgements.map((ack) => ({
      id: ack.id,
      acknowledgedByName: ack.acknowledged_by_name,
      acknowledgedAt: ack.acknowledged_at,
      note: ack.note,
      isLapsed:
        !isSameInstant(ack.clock_in, view.clockIn) ||
        !isSameInstant(ack.clock_out, view.clockOut),
    })),
  };
}

function formatDayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return format(new Date(year, month - 1, day), "EEE, MMM d");
}

// Sessions grouped by the visit's scheduled date ascending, then by scheduled start.
export function buildDrilldownDays(views: SessionView[]): DrilldownDay[] {
  // Dates are yyyy-MM-dd and starts are ISO instants, so string order is time order.
  const sorted = [...views].sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      a.scheduledStart.localeCompare(b.scheduledStart),
  );

  const days: DrilldownDay[] = [];
  for (const view of sorted) {
    const last = days.at(-1);
    if (last?.date === view.scheduledDate) {
      last.sessions.push(toSessionRowView(view));
    } else {
      days.push({
        date: view.scheduledDate,
        label: formatDayLabel(view.scheduledDate),
        sessions: [toSessionRowView(view)],
      });
    }
  }
  return days;
}
