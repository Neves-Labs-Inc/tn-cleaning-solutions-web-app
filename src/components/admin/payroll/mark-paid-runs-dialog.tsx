"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import MarkPaidRunsForm, {
  SkippedRunRow,
} from "@/components/admin/payroll/mark-paid-runs-form";
import { Button } from "@/components/ui/button";
import ResponsiveDialog from "@/components/ui/responsive-dialog";
import { describeMarkPaidTarget, payableRuns } from "@/lib/payroll/mark-paid";
import type { PeriodRun } from "@/lib/payroll/period-view";
import { cn } from "@/lib/utils";

type MarkPaidRunsDialogProps = {
  // Empty means closed. Drafts and paid runs among them are left out.
  runs: PeriodRun[];
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  onClose: () => void;
  // After some or all runs were paid, before onClose.
  onSuccess?: (paidRuns: PeriodRun[]) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};

// One dialog for both entry points: a run's own Mark paid (one run) and the bulk bar (the
// selected finalized runs).
export default function MarkPaidRunsDialog({
  runs,
  periodStart,
  periodEnd,
  periodLabel,
  onClose,
  onSuccess,
  returnFocusRef,
}: MarkPaidRunsDialogProps): React.ReactNode {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  // A refusal means the page behind may be stale, so closing re-reads it.
  const hasRefusalRef = useRef(false);

  const { ready, blocked } = payableRuns(runs);
  const listed = [...ready, ...blocked];
  const isOpen = listed.length > 0;

  function handleClose(): void {
    if (hasRefusalRef.current) router.refresh();
    hasRefusalRef.current = false;
    onClose();
  }

  function handleSuccess(paidRuns: PeriodRun[]): void {
    hasRefusalRef.current = false;
    onSuccess?.(paidRuns);
    onClose();
    router.refresh();
  }

  return (
    <ResponsiveDialog
      open={isOpen}
      onOpenChange={(open) => (open ? null : handleClose())}
      title="Mark paid"
      description={isOpen ? describeMarkPaidTarget(listed, periodLabel) : null}
      isPending={isPending}
      returnFocusRef={returnFocusRef}
    >
      {isOpen && ready.length === 0 ? (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Nothing to mark paid. Fix the blocked runs first, then try again.
          </p>
          <ul className="divide-y rounded-lg border">
            {blocked.map((run) => (
              <SkippedRunRow key={run.key} run={run} />
            ))}
          </ul>
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              variant="outline"
              className={cn(OUTLINE_PRESS_CLASS_NAME, "w-full sm:w-auto")}
              onClick={handleClose}
            >
              Close
            </Button>
          </div>
        </div>
      ) : null}

      {ready.length > 0 ? (
        <MarkPaidRunsForm
          // Remount per selection so each method prefills again.
          key={listed.map((run) => run.key).join(",")}
          ready={ready}
          blocked={blocked}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onCancel={handleClose}
          onSuccess={handleSuccess}
          onRefusal={() => {
            hasRefusalRef.current = true;
          }}
          onPendingChange={setIsPending}
        />
      ) : null}
    </ResponsiveDialog>
  );
}
