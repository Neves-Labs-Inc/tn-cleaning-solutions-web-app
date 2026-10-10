import type { TimeSheetRecord } from "@/types/time-sheet-record";
import { getClockedMinutes, type FlagKind, type SessionView } from "./session-view.ts";

// Open shifts never count toward minutes: their end isn't known yet.

export type CleanerRef = { id: string; full_name: string };

export type CleanerSummary = {
  cleaner: CleanerRef;
  sessionCount: number;
  closedMinutes: number;
  // Open plus in progress.
  openCount: number;
  flagCounts: Record<FlagKind, number>;
  flagTotal: number;
};

export type CleanerMonthSummary = {
  count: number;
  totalMinutes: number;
  // Over closed sessions only; null when none is closed.
  averageMinutes: number | null;
};

function summarizeOne(cleaner: CleanerRef, views: SessionView[]): CleanerSummary {
  const flags = views.flatMap((view) => view.flags);
  const countFlag = (kind: FlagKind) => flags.filter((flag) => flag === kind).length;

  return {
    cleaner,
    sessionCount: views.length,
    closedMinutes: views.reduce((total, view) => total + (view.clockedMinutes ?? 0), 0),
    openCount: views.filter((view) => view.state === "open" || view.state === "in_progress").length,
    flagCounts: {
      open_shift: countFlag("open_shift"),
      missing_clock: countFlag("missing_clock"),
      odd_duration: countFlag("odd_duration"),
    },
    flagTotal: flags.length,
  };
}

// One row per given Cleaner, including those with no sessions, sorted by name. Views of Cleaners
// not given are left out.
export function summarizeCleaners(views: SessionView[], cleaners: CleanerRef[]): CleanerSummary[] {
  return [...cleaners]
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((cleaner) =>
      summarizeOne(
        cleaner,
        views.filter((view) => view.cleanerId === cleaner.id),
      ),
    );
}

// The Cleaner's own month: every listed session counts, only closed ones add minutes.
export function summarizeCleanerMonth(records: TimeSheetRecord[]): CleanerMonthSummary {
  const closedMinutes = records.flatMap((record) =>
    record.clocked_in_at && record.clocked_out_at
      ? [getClockedMinutes(record.clocked_in_at, record.clocked_out_at)]
      : [],
  );
  const totalMinutes = closedMinutes.reduce((total, minutes) => total + minutes, 0);

  return {
    count: records.length,
    totalMinutes,
    averageMinutes:
      closedMinutes.length === 0 ? null : Math.floor(totalMinutes / closedMinutes.length),
  };
}
