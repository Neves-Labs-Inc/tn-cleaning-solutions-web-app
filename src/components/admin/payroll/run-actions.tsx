"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Banknote, FileCheck2, RotateCcw, UserMinus } from "lucide-react";

import {
  OUTLINE_PRESS_CLASS_NAME,
  PRESS_CLASS_NAME,
} from "@/components/admin/detail-page/press";
import EditPayoutDialog from "@/components/admin/payroll/edit-payout-dialog";
import MarkPaidRunsDialog from "@/components/admin/payroll/mark-paid-runs-dialog";
import {
  usePeriodActions,
  type PeriodActions,
} from "@/components/admin/payroll/period-actions-context";
import RunStateLine from "@/components/admin/payroll/run-state-line";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import SubmitButton from "@/components/ui/submit-button";
import { findRowToggle, useRunActions } from "@/hooks/use-run-actions";
import { getRunStateLine } from "@/lib/payroll/format";
import { getBlockerLink } from "@/lib/payroll/mark-paid";
import {
  getFirstName,
  getRunActionKind,
  UNDO_BLOCKED_NOTE,
  type RunActionKind,
} from "@/lib/payroll/period-actions";
import type { PeriodRun, PeriodStatus } from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type RunActionsProps = {
  run: PeriodRun;
  periodStatus: PeriodStatus;
};

type ActionButtonsProps = {
  run: PeriodRun;
  kind: RunActionKind;
  periodActions: PeriodActions;
  reasonId: string;
  undoReasonId: string;
};

const AREA_CLASS_NAME =
  "flex flex-col items-stretch gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10 md:flex-row md:flex-wrap md:items-center md:justify-end";
const PAID_AREA_CLASS_NAME =
  "flex flex-wrap items-center gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10 animate-in fade-in-0 duration-base";
const BUTTON_CLASS_NAME = "w-full md:w-auto";

function getFinalizeLabel(run: PeriodRun): string {
  return `Finalize ${formatCents(run.totalCents)}`;
}

// Mark paid for this one run, from its ledger. Disabled with the reason beside it while blocked.
function MarkPaidButton({
  run,
  periodActions,
  isBusy,
  reasonId,
}: {
  run: PeriodRun;
  periodActions: PeriodActions;
  isBusy: boolean;
  reasonId: string;
}): React.ReactNode {
  const [dialogRuns, setDialogRuns] = useState<PeriodRun[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // The button is gone once the run is paid, so focus then returns to the row's expand toggle.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isBlocked = run.blockedReason !== null;
  const link = getBlockerLink(run);

  function handleOpen(): void {
    returnFocusRef.current = buttonRef.current;
    setDialogRuns([run]);
  }

  return (
    <>
      {isBlocked && link !== null ? (
        <Link
          href={link.href}
          className="flex min-h-11 items-center text-sm text-destructive underline underline-offset-4 md:min-h-0"
        >
          {link.label}
        </Link>
      ) : null}
      <Button
        ref={buttonRef}
        type="button"
        disabled={isBusy || isBlocked}
        aria-describedby={isBlocked ? reasonId : undefined}
        className={cn(BUTTON_CLASS_NAME, PRESS_CLASS_NAME, "md:order-last")}
        onClick={handleOpen}
      >
        <Banknote data-icon="inline-start" aria-hidden="true" />
        {`Mark paid · ${formatCents(run.totalCents)}`}
      </Button>
      <MarkPaidRunsDialog
        runs={dialogRuns}
        periodStart={periodActions.periodStart}
        periodEnd={periodActions.periodEnd}
        periodLabel={periodActions.periodLabel}
        returnFocusRef={returnFocusRef}
        onSuccess={() => {
          returnFocusRef.current = findRowToggle(run.key);
        }}
        onClose={() => setDialogRuns([])}
      />
    </>
  );
}

// The buttons for an unpaid run, beside 07's state line. A paid run only offers Edit payout.
function ActionButtons({
  run,
  kind,
  periodActions,
  reasonId,
  undoReasonId,
}: ActionButtonsProps): React.ReactNode {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { pendingAction, refusal, primaryRef, finalize, undo, remove } =
    useRunActions({
      run,
      periodStart: periodActions.periodStart,
      periodLabel: periodActions.periodLabel,
      onRemoved: periodActions.focusAddCleaner,
    });
  const isBusy = pendingAction !== null;
  const firstName = getFirstName(run.cleaner.name);
  const isDraft =
    kind === "running" ||
    kind === "draft_ready" ||
    kind === "draft_blocked" ||
    kind === "draft_empty_added";
  const isFinalizeDisabled = kind === "running" || kind === "draft_blocked";

  async function handleConfirmUndo(): Promise<void> {
    await undo();
    setIsConfirmOpen(false);
  }

  return (
    <>
      {kind === "draft_empty_added" ? (
        <SubmitButton
          variant="ghost"
          label="Remove from period"
          pendingLabel="Removing…"
          icon={<UserMinus aria-hidden="true" />}
          isPending={pendingAction === "remove"}
          disabled={isBusy}
          className={cn(BUTTON_CLASS_NAME, OUTLINE_PRESS_CLASS_NAME)}
          onClick={remove}
        />
      ) : null}

      {isDraft ? (
        <SubmitButton
          ref={primaryRef}
          label={getFinalizeLabel(run)}
          pendingLabel="Finalizing…"
          icon={<FileCheck2 aria-hidden="true" />}
          isPending={pendingAction === "finalize"}
          disabled={isBusy || isFinalizeDisabled}
          aria-describedby={isFinalizeDisabled ? reasonId : undefined}
          className={cn(BUTTON_CLASS_NAME, PRESS_CLASS_NAME)}
          onClick={finalize}
        />
      ) : null}

      {kind === "finalized" || kind === "finalized_undo_blocked" ? (
        <MarkPaidButton
          run={run}
          periodActions={periodActions}
          isBusy={isBusy}
          reasonId={reasonId}
        />
      ) : null}

      {kind === "finalized" || kind === "finalized_undo_blocked" ? (
        <SubmitButton
          ref={primaryRef}
          variant="outline"
          label="Undo finalize"
          pendingLabel="Undoing…"
          icon={<RotateCcw aria-hidden="true" />}
          isPending={pendingAction === "undo"}
          disabled={isBusy || kind === "finalized_undo_blocked"}
          aria-describedby={
            kind === "finalized_undo_blocked" ? undoReasonId : undefined
          }
          className={cn(BUTTON_CLASS_NAME, OUTLINE_PRESS_CLASS_NAME)}
          onClick={() => setIsConfirmOpen(true)}
        />
      ) : null}

      {refusal === null ? null : (
        <p
          role="alert"
          className="text-sm text-destructive md:basis-full md:text-right"
        >
          {refusal}
        </p>
      )}

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={`Return ${firstName}'s run to draft?`}
        description="Her shifts are released; Adjustments are kept."
        confirmLabel="Undo finalize"
        pendingLabel="Undoing…"
        keepLabel="Keep finalized"
        confirmVariant="default"
        returnFocusRef={primaryRef}
        onConfirm={handleConfirmUndo}
      />
    </>
  );
}

// The foot of a run's ledger: where the run stands and, on an actionable page, what to do next.
export default function RunActions({
  run,
  periodStatus,
}: RunActionsProps): React.ReactNode {
  const periodActions = usePeriodActions();
  const reasonId = useId();
  const undoReasonId = useId();
  const kind =
    periodActions === null
      ? "paid"
      : getRunActionKind(
          run,
          periodActions.isEnded,
          periodActions.offCycleCleanerIds.has(run.cleaner.id),
        );
  const stateLine = getRunStateLine(run, periodStatus);
  const undoNote = { tone: "muted" as const, text: UNDO_BLOCKED_NOTE };
  // A blocker on Mark paid leads; the Undo note then gets its own line.
  const isMarkPaidBlocked = run.blockedReason !== null;

  if (periodActions === null || kind === "paid") {
    return (
      <div
        className={
          run.status === "paid" ? PAID_AREA_CLASS_NAME : AREA_CLASS_NAME
        }
      >
        <RunStateLine line={stateLine} id={reasonId} />
        {periodActions === null || run.status !== "paid" ? null : (
          <EditPayoutDialog
            run={run}
            periodStart={periodActions.periodStart}
            periodEnd={periodActions.periodEnd}
            periodLabel={periodActions.periodLabel}
            className="ms-auto"
          />
        )}
      </div>
    );
  }

  return (
    <div className={AREA_CLASS_NAME}>
      {kind === "finalized_undo_blocked" && !isMarkPaidBlocked ? (
        <RunStateLine line={undoNote} id={undoReasonId} />
      ) : (
        <RunStateLine line={stateLine} id={reasonId} />
      )}
      {kind === "finalized_undo_blocked" && isMarkPaidBlocked ? (
        <RunStateLine line={undoNote} id={undoReasonId} />
      ) : null}
      <ActionButtons
        run={run}
        kind={kind}
        periodActions={periodActions}
        reasonId={reasonId}
        undoReasonId={undoReasonId}
      />
    </div>
  );
}
