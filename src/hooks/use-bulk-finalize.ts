import { useState, useTransition } from "react";
import { toast } from "sonner";

import { finalizePayRuns } from "@/lib/actions/payroll";
import {
  describeFinalizeResult,
  toBulkOutcome,
} from "@/lib/payroll/bulk-result";
import { getFirstName } from "@/lib/payroll/period-actions";
import type { PeriodRun } from "@/lib/payroll/period-view";

export type BulkFinalize = {
  isPending: boolean;
  // A failed call (network, unknown or a whole-call refusal), shown in the bar.
  error: string | null;
  finalize: (runs: PeriodRun[]) => void;
};

type BulkFinalizeInput = {
  periodStart: string;
  onFinalized: () => void;
};

const FINALIZE_FAILED_MESSAGE = "Couldn't finalize. Try again.";
const SKIPPED_TOAST_DURATION_MS = 8000;
const SERVER_ERROR_STATUS = 500;

// Finalizes the selected drafts in one finalize_pay_runs call. Blocked ones go too: the SQL
// refuses them per Cleaner, and the result line names them with their reasons.
export function useBulkFinalize({
  periodStart,
  onFinalized,
}: BulkFinalizeInput): BulkFinalize {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function finalize(runs: PeriodRun[]): void {
    const drafts = runs.filter((run) => run.status === "draft");
    const namesById = new Map(
      drafts.map((run) => [run.cleaner.id, getFirstName(run.cleaner.name)]),
    );

    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof finalizePayRuns>>;
      try {
        result = await finalizePayRuns(
          periodStart,
          drafts.map((run) => run.cleaner.id),
        );
      } catch (cause) {
        console.error("payroll: bulk finalize request failed", cause);
        setError(FINALIZE_FAILED_MESSAGE);
        return;
      }

      if (result.value === null) {
        const isUnexpected = result.status >= SERVER_ERROR_STATUS;
        setError(isUnexpected ? FINALIZE_FAILED_MESSAGE : result.error);
        return;
      }

      const outcomes = result.value.map((row) =>
        toBulkOutcome(row, namesById.get(row.employeeId) ?? row.employeeId),
      );
      const doneCount = outcomes.filter((item) => item.refusal === null).length;
      const text = describeFinalizeResult(outcomes);
      if (doneCount === 0) {
        toast.error(text);
      } else if (doneCount < outcomes.length) {
        toast.warning(text, { duration: SKIPPED_TOAST_DURATION_MS });
        onFinalized();
      } else {
        toast.success(text);
        onFinalized();
      }
    });
  }

  return { isPending, error, finalize };
}
