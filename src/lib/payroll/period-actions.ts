// Relative imports: node --test runs this file without the @/ alias.
import { describeRefusal } from "./bulk-result.ts";
import { getPayrollErrorMessage } from "./errors.ts";
import type { PayCleaner } from "./payroll-data.ts";
import type { BlockerCounts, PeriodRun } from "./period-view.ts";

// What the period page's action controls offer for each run, derived from the view. Pure. The SQL
// functions refuse anything this gets wrong; this keeps the controls from offering it.

export type RunActionKind =
  | "running"
  | "draft_ready"
  | "draft_blocked"
  | "draft_empty_added"
  | "finalized"
  | "finalized_undo_blocked"
  | "paid";

export type CleanerCandidate = { id: string; name: string; isActive: boolean };

// Shown beside a disabled Undo finalize: the server's has_later_run refusal, said up front.
export const UNDO_BLOCKED_NOTE = getPayrollErrorMessage("has_later_run");

// "Maria" from "Maria Lopez", for toasts and the Undo finalize confirm.
export function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function getRunBlockers(run: PeriodRun): BlockerCounts {
  return {
    openShifts: run.problemSessions.filter((item) => item.kind === "open_shift")
      .length,
    missingClocks: run.problemSessions.filter(
      (item) => item.kind === "missing_clock",
    ).length,
    noRateLines: run.noRateLines.length,
  };
}

// A stored regular draft with nothing on it: an Add Cleaner that can still be undone.
function isEmptyAddedDraft(run: PeriodRun): boolean {
  return (
    run.kind === "regular" &&
    run.runId !== null &&
    run.lines.length === 0 &&
    run.noRateLines.length === 0 &&
    run.problemSessions.length === 0 &&
    run.adjustments.length === 0
  );
}

// hasOffCycleRun: the Cleaner has an off-cycle run in the period, so her regular run can't go
// back to draft (has_later_run).
export function getRunActionKind(
  run: PeriodRun,
  isEnded: boolean,
  hasOffCycleRun: boolean,
): RunActionKind {
  let kind: RunActionKind = "paid";
  if (run.status === "draft" && !isEnded) {
    kind = "running";
  } else if (run.status === "draft" && run.blockedReason !== null) {
    kind = "draft_blocked";
  } else if (run.status === "draft" && isEmptyAddedDraft(run)) {
    kind = "draft_empty_added";
  } else if (run.status === "draft") {
    kind = "draft_ready";
  } else if (
    run.status === "finalized" &&
    run.kind === "regular" &&
    hasOffCycleRun
  ) {
    kind = "finalized_undo_blocked";
  } else if (run.status === "finalized") {
    kind = "finalized";
  }
  return kind;
}

export type AdjustmentAccess = { canAdd: boolean; canDelete: boolean };

// add_pay_adjustment lands on the Cleaner's current run: her unpaid off-cycle run when she has
// one, else her regular run. So a regular run takes new Adjustments only while she has no unpaid
// off-cycle run. Delete targets the Adjustment itself, so any unpaid run in an ended period can.
export function getAdjustmentAccess(
  run: PeriodRun,
  isEnded: boolean,
  hasUnpaidOffCycleRun: boolean,
): AdjustmentAccess {
  const canDelete = isEnded && run.status !== "paid";
  const canAdd = canDelete && !(run.kind === "regular" && hasUnpaidOffCycleRun);
  return { canAdd, canDelete };
}

export function isReadyDraft(run: PeriodRun): boolean {
  return run.status === "draft" && run.blockedReason === null;
}

// "1 blocked, will be skipped: Carla (1 Missing clock), Maria (no Pay rate)"; null when none is.
export function describeSkippedDrafts(runs: PeriodRun[]): string | null {
  const blocked = runs.filter(
    (run) => run.status === "draft" && run.blockedReason !== null,
  );
  if (blocked.length === 0) return null;

  const names = blocked.map(
    (run) =>
      `${getFirstName(run.cleaner.name)} (${describeRefusal({ blockers: getRunBlockers(run) })})`,
  );
  return `${blocked.length} blocked, will be skipped: ${names.join(", ")}`;
}

// Every Cleaner without a run in the period, active ones first, then by name.
export function getAddCleanerCandidates(
  cleaners: PayCleaner[],
  runs: PeriodRun[],
): CleanerCandidate[] {
  const inPeriod = new Set(runs.map((run) => run.cleaner.id));
  return cleaners
    .filter((item) => !inPeriod.has(item.id))
    .map((item) => ({
      id: item.id,
      name: item.fullName,
      isActive: item.isActive,
    }))
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name),
    );
}
