import { useMemo } from "react";

import type { PeriodActions } from "@/components/admin/payroll/period-actions-context";
import { useAddCleanerFocus } from "@/hooks/use-add-cleaner-focus";
import { useBulkFinalize, type BulkFinalize } from "@/hooks/use-bulk-finalize";
import { useExpandedRuns, type ExpandedRuns } from "@/hooks/use-expanded-runs";
import {
  usePeriodSelection,
  type PeriodSelection,
} from "@/hooks/use-period-selection";
import type { PeriodRun, PeriodView } from "@/lib/payroll/period-view";

export type PeriodWorkspace = {
  expanded: ExpandedRuns;
  // null while the period runs: nothing is selectable.
  selection: PeriodSelection | null;
  selectedRuns: PeriodRun[];
  bulk: BulkFinalize;
  actions: PeriodActions;
};

// The period page's client state: open ledgers, the selection, bulk Finalize, and what the
// action controls in each ledger need to know.
export function usePeriodWorkspace(view: PeriodView): PeriodWorkspace {
  const { runs, isEnded } = view;
  const expanded = useExpandedRuns(runs.map((run) => run.key));
  const selectableKeys = isEnded
    ? runs.filter((run) => run.status !== "paid").map((run) => run.key)
    : [];
  const selection = usePeriodSelection(selectableKeys);
  const bulk = useBulkFinalize({
    periodStart: view.period.start,
    onFinalized: selection.clear,
  });
  const selectedRuns = runs.filter((run) => selection.isSelected(run.key));

  const focusAddCleaner = useAddCleanerFocus(runs.map((run) => run.key));
  const { expand, adjustmentFormKeys } = expanded;
  const actions = useMemo<PeriodActions>(() => {
    const offCycleRuns = runs.filter((run) => run.kind === "off_cycle");
    return {
      periodStart: view.period.start,
      periodLabel: view.label,
      periodEnd: view.period.end,
      isEnded,
      offCycleCleanerIds: new Set(offCycleRuns.map((run) => run.cleaner.id)),
      unpaidOffCycleCleanerIds: new Set(
        offCycleRuns
          .filter((run) => run.status !== "paid")
          .map((run) => run.cleaner.id),
      ),
      offCycleDraftKeys: new Map(
        offCycleRuns
          .filter((run) => run.status === "draft")
          .map((run) => [run.cleaner.id, run.key]),
      ),
      adjustmentFormKeys,
      expand,
      focusAddCleaner,
    };
  }, [
    runs,
    view.period.start,
    view.label,
    view.period.end,
    isEnded,
    adjustmentFormKeys,
    expand,
    focusAddCleaner,
  ]);

  return {
    expanded,
    selection: isEnded ? selection : null,
    selectedRuns,
    bulk,
    actions,
  };
}
