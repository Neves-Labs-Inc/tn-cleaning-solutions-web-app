"use client";

import { AlertCircle, FileCheck2, TriangleAlert } from "lucide-react";

import {
  OUTLINE_PRESS_CLASS_NAME,
  PRESS_CLASS_NAME,
} from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import SubmitButton from "@/components/ui/submit-button";
import type { BulkFinalize } from "@/hooks/use-bulk-finalize";
import type { PeriodSelection } from "@/hooks/use-period-selection";
import {
  describeSkippedDrafts,
  isReadyDraft,
} from "@/lib/payroll/period-actions";
import type { PeriodRun } from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type PeriodBulkBarProps = {
  selection: PeriodSelection;
  bulk: BulkFinalize;
  // The selected runs.
  views: PeriodRun[];
  // The Mark paid button, right of Finalize.
  markPaidSlot?: React.ReactNode;
};

function getFinalizeLabel(readyCount: number): string {
  return readyCount === 0 ? "Finalize" : `Finalize ${readyCount}`;
}

// Fixed to the bottom at every width while any run is selected: expanded ledgers make the table
// tall, so a toolbar bar would scroll out of view. Starts at the sidebar's edge from lg.
export default function PeriodBulkBar({
  selection,
  bulk,
  views,
  markPaidSlot = null,
}: PeriodBulkBarProps): React.ReactNode {
  const isOpen = selection.selectedCount > 0;
  const readyCount = views.filter(isReadyDraft).length;
  const totalCents = views.reduce((total, run) => total + run.totalCents, 0);
  const skipped = describeSkippedDrafts(views);
  const hasSlot = markPaidSlot !== null;
  // Mark paid takes the primary style once the selection has finalized runs.
  const isFinalizeSecondary =
    hasSlot && views.some((run) => run.status === "finalized");

  const clearButton = (
    <Button
      type="button"
      variant="ghost"
      disabled={bulk.isPending}
      className={OUTLINE_PRESS_CLASS_NAME}
      onClick={selection.clear}
    >
      Clear
    </Button>
  );

  return (
    <div
      inert={!isOpen}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur transition-[translate,opacity] lg:left-68",
        isOpen
          ? "translate-y-0 opacity-100 duration-base ease-out-quart"
          : "pointer-events-none translate-y-full opacity-0 duration-[140ms] ease-in-quart",
      )}
    >
      <form
        action={() => bulk.finalize(views)}
        className="mx-auto max-w-7xl space-y-3 xl:flex xl:items-center xl:justify-between xl:gap-4 xl:space-y-0"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-medium">
                {selection.selectedCount} selected
              </span>
              {" · "}
              <span className="font-mono tabular-nums">
                {formatCents(totalCents)}
              </span>
            </p>
            <div className="xl:hidden">{clearButton}</div>
          </div>
          {skipped === null ? null : (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <TriangleAlert
                aria-hidden="true"
                className="mt-px size-3.5 shrink-0"
              />
              <span className="min-w-0 break-words">{skipped}</span>
            </p>
          )}
          {bulk.error === null ? null : (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-sm text-destructive"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0 break-words">{bulk.error}</span>
            </p>
          )}
        </div>
        <div
          className={cn(
            "grid gap-2 md:flex md:shrink-0 md:items-center md:justify-end",
            hasSlot ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <div className="hidden xl:block">{clearButton}</div>
          <SubmitButton
            variant={isFinalizeSecondary ? "outline" : "default"}
            label={getFinalizeLabel(readyCount)}
            pendingLabel="Finalizing…"
            icon={<FileCheck2 aria-hidden="true" />}
            isPending={bulk.isPending}
            disabled={readyCount === 0}
            className={
              isFinalizeSecondary ? OUTLINE_PRESS_CLASS_NAME : PRESS_CLASS_NAME
            }
          />
          {markPaidSlot}
        </div>
      </form>
    </div>
  );
}
