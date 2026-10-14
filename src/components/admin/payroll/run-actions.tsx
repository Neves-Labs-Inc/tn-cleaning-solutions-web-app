"use client";

import { useId, useState } from "react";
import { FileCheck2, RotateCcw, UserMinus } from "lucide-react";

import {
  OUTLINE_PRESS_CLASS_NAME,
  PRESS_CLASS_NAME,
} from "@/components/admin/detail-page/press";
import { usePeriodActions } from "@/components/admin/payroll/period-actions-context";
import RunStateLine from "@/components/admin/payroll/run-state-line";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import SubmitButton from "@/components/ui/submit-button";
import { useRunActions } from "@/hooks/use-run-actions";
import { getRunStateLine } from "@/lib/payroll/format";
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
  periodStart: string;
  periodLabel: string;
  onRemoved: () => void;
  reasonId: string;
};

const AREA_CLASS_NAME =
  "flex flex-col items-stretch gap-2 rounded-lg bg-card p-3 ring-1 ring-foreground/10 md:flex-row md:flex-wrap md:items-center md:justify-end";
const BUTTON_CLASS_NAME = "w-full md:w-auto";

function getFinalizeLabel(run: PeriodRun): string {
  return `Finalize ${formatCents(run.totalCents)}`;
}

// The buttons for one run, beside 07's state line. Paid runs get none (09 owns them).
function ActionButtons({
  run,
  kind,
  periodStart,
  periodLabel,
  onRemoved,
  reasonId,
}: ActionButtonsProps): React.ReactNode {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const { pendingAction, refusal, primaryRef, finalize, undo, remove } =
    useRunActions({ run, periodStart, periodLabel, onRemoved });
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
        <SubmitButton
          ref={primaryRef}
          variant="outline"
          label="Undo finalize"
          pendingLabel="Undoing…"
          icon={<RotateCcw aria-hidden="true" />}
          isPending={pendingAction === "undo"}
          disabled={isBusy || kind === "finalized_undo_blocked"}
          aria-describedby={
            kind === "finalized_undo_blocked" ? reasonId : undefined
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
  const kind =
    periodActions === null
      ? "paid"
      : getRunActionKind(
          run,
          periodActions.isEnded,
          periodActions.offCycleCleanerIds.has(run.cleaner.id),
        );
  const stateLine =
    kind === "finalized_undo_blocked"
      ? { tone: "muted" as const, text: UNDO_BLOCKED_NOTE }
      : getRunStateLine(run, periodStatus);

  return (
    <div className={AREA_CLASS_NAME}>
      <RunStateLine line={stateLine} id={reasonId} />
      {periodActions === null || kind === "paid" ? null : (
        <ActionButtons
          run={run}
          kind={kind}
          periodStart={periodActions.periodStart}
          periodLabel={periodActions.periodLabel}
          onRemoved={periodActions.focusAddCleaner}
          reasonId={reasonId}
        />
      )}
    </div>
  );
}
