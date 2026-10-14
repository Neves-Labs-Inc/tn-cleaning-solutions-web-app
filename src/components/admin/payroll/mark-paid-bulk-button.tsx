"use client";

import { useRef, useState } from "react";
import { Banknote } from "lucide-react";

import {
  OUTLINE_PRESS_CLASS_NAME,
  PRESS_CLASS_NAME,
} from "@/components/admin/detail-page/press";
import MarkPaidRunsDialog from "@/components/admin/payroll/mark-paid-runs-dialog";
import { usePeriodActions } from "@/components/admin/payroll/period-actions-context";
import { Button } from "@/components/ui/button";
import { findRowToggle } from "@/hooks/use-run-actions";
import type { PeriodRun } from "@/lib/payroll/period-view";

type MarkPaidBulkButtonProps = {
  // The selected runs; only the finalized ones are counted and listed.
  runs: PeriodRun[];
  disabled: boolean;
  // Some or all runs were paid: the selection clears.
  onPaid: () => void;
};

// The bulk bar's Mark paid N and its dialog.
export default function MarkPaidBulkButton({
  runs,
  disabled,
  onPaid,
}: MarkPaidBulkButtonProps): React.ReactNode {
  const periodActions = usePeriodActions();
  // The runs the dialog was opened with; empty while closed, so a refresh can't change them.
  const [dialogRuns, setDialogRuns] = useState<PeriodRun[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // After a payment the selection clears and the bar goes inert, so focus goes to the first paid
  // run's expand toggle instead of this button.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const finalized = runs.filter((run) => run.status === "finalized");
  const count = finalized.length;
  const hasFinalized = count > 0;

  if (periodActions === null) return null;

  function handleOpen(): void {
    returnFocusRef.current = buttonRef.current;
    setDialogRuns(finalized);
  }

  function handleSuccess(paidRuns: PeriodRun[]): void {
    const [firstPaid] = paidRuns;
    returnFocusRef.current =
      firstPaid === undefined ? null : findRowToggle(firstPaid.key);
    onPaid();
  }

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant={hasFinalized ? "default" : "outline"}
        disabled={disabled || !hasFinalized}
        className={hasFinalized ? PRESS_CLASS_NAME : OUTLINE_PRESS_CLASS_NAME}
        onClick={handleOpen}
      >
        <Banknote data-icon="inline-start" aria-hidden="true" />
        Mark paid
        {hasFinalized ? (
          // Reserved width, so the button doesn't jump as the count changes.
          <span className="min-w-[3ch] text-left tabular-nums">{count}</span>
        ) : null}
      </Button>
      <MarkPaidRunsDialog
        runs={dialogRuns}
        periodStart={periodActions.periodStart}
        periodEnd={periodActions.periodEnd}
        periodLabel={periodActions.periodLabel}
        returnFocusRef={returnFocusRef}
        onSuccess={handleSuccess}
        onClose={() => setDialogRuns([])}
      />
    </>
  );
}
