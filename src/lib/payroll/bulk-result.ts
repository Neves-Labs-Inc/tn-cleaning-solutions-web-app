// Relative import: node --test runs this file without the @/ alias.
import { describeClockProblems, type BlockerCounts } from "./period-view.ts";

// The one-line result of a bulk Finalize or Mark paid:
// "<Done verb> N · M blocked: <Name>: <reason>, …". Pure.

// A blocked run carries its counts per kind; any other refusal carries a readable message.
export type BulkRefusal = { blockers: BlockerCounts } | { message: string };

export type BulkOutcome = {
  cleanerName: string;
  refusal: BulkRefusal | null;
};

const NO_RATE_REASON = "no Pay rate";

// "1 Open shift and 1 Missing clock", "no Pay rate", or both joined with "and".
function describeRefusal(refusal: BulkRefusal): string {
  if ("message" in refusal) return refusal.message;

  const clockProblems = describeClockProblems(refusal.blockers);
  const noRate = refusal.blockers.noRateLines > 0 ? NO_RATE_REASON : "";
  return [clockProblems, noRate].filter((part) => part !== "").join(" and ");
}

function describeBulkResult(doneText: string, outcomes: BulkOutcome[]): string {
  const refused = outcomes.flatMap((outcome) =>
    outcome.refusal === null
      ? []
      : [`${outcome.cleanerName}: ${describeRefusal(outcome.refusal)}`],
  );
  return refused.length === 0
    ? doneText
    : `${doneText} · ${refused.length} blocked: ${refused.join(", ")}`;
}

function countDone(outcomes: BulkOutcome[]): number {
  return outcomes.filter((outcome) => outcome.refusal === null).length;
}

// "Finalized 2 · 2 blocked: Carla: 1 Missing clock, Maria: 1 Open shift"
export function describeFinalizeResult(outcomes: BulkOutcome[]): string {
  return describeBulkResult(`Finalized ${countDone(outcomes)}`, outcomes);
}

// "Marked 3 paid · 1 blocked: Ana: 1 Missing clock"
export function describeMarkPaidResult(outcomes: BulkOutcome[]): string {
  return describeBulkResult(`Marked ${countDone(outcomes)} paid`, outcomes);
}
