"use client";

import AddCleanerDialog from "@/components/admin/payroll/add-cleaner-dialog";
import PayPeriodEmpty from "@/components/admin/payroll/pay-period-empty";
import PayRunList from "@/components/admin/payroll/pay-run-list";
import { PeriodActionsContext } from "@/components/admin/payroll/period-actions-context";
import PeriodBulkBar from "@/components/admin/payroll/period-bulk-bar";
import StragglersSection from "@/components/admin/payroll/stragglers-section";
import { Checkbox } from "@/components/ui/checkbox";
import { usePeriodWorkspace } from "@/hooks/use-period-workspace";
import { pluralize } from "@/lib/payroll/format";
import type { CleanerCandidate } from "@/lib/payroll/period-actions";
import type { PeriodView } from "@/lib/payroll/period-view";
import { cn } from "@/lib/utils";

type PeriodWorkspaceProps = {
  view: PeriodView;
  // Cleaners without a run in the period, for Add Cleaner.
  candidates: CleanerCandidate[];
};

// Everything below the period header: stragglers, the runs with their actions, and the bulk bar.
// A running period shows the same runs read-only.
export default function PeriodWorkspace({
  view,
  candidates,
}: PeriodWorkspaceProps): React.ReactNode {
  const { expanded, selection, selectedRuns, bulk, actions } =
    usePeriodWorkspace(view);
  const { runs, isEnded } = view;
  const hasRuns = runs.length > 0;
  const isBarOpen = selection !== null && selection.selectedCount > 0;
  const hasUnpaid = runs.some((run) => run.status !== "paid");
  const cleanerCount = new Set(runs.map((run) => run.cleaner.id)).size;

  return (
    <PeriodActionsContext.Provider value={actions}>
      <div className={cn("space-y-6", isBarOpen && "pb-48 xl:pb-28")}>
        {isEnded && view.stragglers.length > 0 ? (
          <StragglersSection stragglers={view.stragglers} />
        ) : null}

        {hasRuns ? (
          <div className="space-y-3">
            {selection === null ? null : (
              <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-card py-1 pr-1 ring-1 ring-foreground/10 xl:bg-transparent xl:p-0 xl:ring-0">
                {hasUnpaid ? (
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-4 text-sm font-medium xl:hidden">
                    <Checkbox
                      checked={selection.isAllSelected}
                      indeterminate={
                        selection.isSomeSelected && !selection.isAllSelected
                      }
                      disabled={bulk.isPending}
                      onCheckedChange={(checked) =>
                        checked ? selection.selectAll() : selection.clear()
                      }
                    />
                    Select all unpaid
                  </label>
                ) : (
                  <span className="xl:hidden" />
                )}
                <p className="hidden text-sm text-muted-foreground xl:block">
                  {pluralize(cleanerCount, "Cleaner")}
                </p>
                <AddCleanerDialog candidates={candidates} />
              </div>
            )}
            <PayRunList
              runs={runs}
              periodStatus={view.status}
              totals={view.totals}
              expandedKeys={expanded.expandedKeys}
              onToggle={expanded.toggle}
              selection={selection}
              isSelectionDisabled={bulk.isPending}
            />
          </div>
        ) : (
          <PayPeriodEmpty
            isEnded={isEnded}
            action={
              isEnded ? <AddCleanerDialog candidates={candidates} /> : null
            }
          />
        )}
      </div>

      {selection === null ? null : (
        <PeriodBulkBar selection={selection} bulk={bulk} views={selectedRuns} />
      )}
    </PeriodActionsContext.Provider>
  );
}
