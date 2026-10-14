import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  finalizePayRuns,
  removeCleanerFromPayPeriod,
  undoFinalizePayRun,
} from "@/lib/actions/payroll";
import { toBulkOutcome } from "@/lib/payroll/bulk-result";
import { getFirstName } from "@/lib/payroll/period-actions";
import { describeBlockers, type PeriodRun } from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { requestAction } from "@/lib/payroll/request-action";
import type { Result } from "@/lib/result";

export type RunAction = "finalize" | "undo" | "remove";

export type RunActions = {
  pendingAction: RunAction | null;
  // The last refusal, shown inline under the buttons; cleared on the next attempt.
  refusal: string | null;
  // The button that takes focus once Finalize or Undo lands (Undo after Finalize, and back).
  primaryRef: React.RefObject<HTMLButtonElement | null>;
  finalize: () => void;
  // Awaited by the confirm dialog, which stays pending until it resolves.
  undo: () => Promise<void>;
  remove: () => void;
};

type RunActionsInput = {
  run: PeriodRun;
  periodStart: string;
  periodLabel: string;
  // Called once a Remove from period lands; the row and its buttons go away.
  onRemoved: () => void;
};

const SERVER_ERROR_STATUS = 500;

// The visible row's expand toggle: the table and the cards both render every row.
function findRowToggle(key: string): HTMLElement | null {
  const toggles = document.querySelectorAll<HTMLElement>(
    `[data-run-key="${CSS.escape(key)}"] [aria-expanded]`,
  );
  return (
    [...toggles].find((toggle) => toggle.getClientRects().length > 0) ?? null
  );
}

// Refusals show inline next to the control; anything unexpected is a toast.
function isUnexpected(result: Result<unknown>): boolean {
  return result.status >= SERVER_ERROR_STATUS;
}

// Finalize, Undo finalize and Remove from period for one run's ledger action area.
export function useRunActions({
  run,
  periodStart,
  periodLabel,
  onRemoved,
}: RunActionsInput): RunActions {
  // The last action started: pending while its transition (the action and the refresh) runs, so
  // the button never flashes idle before the refreshed run replaces it.
  const [lastAction, setLastAction] = useState<RunAction | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const shouldFocusPrimaryRef = useRef(false);
  const firstName = getFirstName(run.cleaner.name);

  // The refreshed run renders its new primary button; focus it, or the row's expand toggle when
  // it's disabled (a run blocked again after Undo), so focus never drops to <body>.
  useEffect(() => {
    if (!shouldFocusPrimaryRef.current) return;

    shouldFocusPrimaryRef.current = false;
    const primary = primaryRef.current;
    const target =
      primary !== null && !primary.disabled ? primary : findRowToggle(run.key);
    target?.focus();
  }, [run.status, run.key]);

  function showFailure(result: Result<unknown>): void {
    if (isUnexpected(result)) {
      toast.error(result.error);
    } else {
      setRefusal(result.error);
    }
  }

  function finalize(): void {
    setRefusal(null);
    setLastAction("finalize");
    startTransition(async () => {
      const result = await requestAction("finalize", () =>
        finalizePayRuns(periodStart, [run.cleaner.id]),
      );
      if (result === null) return;

      const row = result.value?.[0] ?? null;
      const outcome =
        row === null ? null : toBulkOutcome(row, run.cleaner.name);

      if (result.error !== null || outcome === null) {
        showFailure(result);
      } else if (outcome.refusal === null) {
        shouldFocusPrimaryRef.current = true;
        toast.success(
          `Finalized ${firstName}'s run · ${formatCents(run.totalCents)}`,
        );
      } else if ("blockers" in outcome.refusal) {
        setRefusal(describeBlockers(outcome.refusal.blockers, "finalize"));
      } else {
        setRefusal(outcome.refusal.message);
      }
    });
  }

  async function undo(): Promise<void> {
    if (run.runId === null) return;

    setRefusal(null);
    setLastAction("undo");
    setIsUndoing(true);
    const runId = run.runId;
    const result = await requestAction("undo finalize", () =>
      undoFinalizePayRun(runId, periodStart),
    );
    // A null result already showed its failure (requestAction).
    if (result?.error === null) {
      shouldFocusPrimaryRef.current = true;
      toast.success(`${firstName}'s run is back to draft`);
    } else if (result !== null) {
      showFailure(result);
    }
    setIsUndoing(false);
  }

  function remove(): void {
    setRefusal(null);
    setLastAction("remove");
    startTransition(async () => {
      const result = await requestAction("remove cleaner", () =>
        removeCleanerFromPayPeriod(run.cleaner.id, periodStart),
      );
      if (result === null) return;

      if (result.error === null) {
        toast.success(`Removed ${firstName} from ${periodLabel}`);
        onRemoved();
      } else {
        showFailure(result);
      }
    });
  }

  let pendingAction: RunAction | null = null;
  if (isUndoing) {
    pendingAction = "undo";
  } else if (isPending) {
    pendingAction = lastAction;
  }

  return { pendingAction, refusal, primaryRef, finalize, undo, remove };
}
