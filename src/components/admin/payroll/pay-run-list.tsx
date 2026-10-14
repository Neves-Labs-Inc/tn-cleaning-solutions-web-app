"use client";

import PayRunCards from "@/components/admin/payroll/pay-run-cards";
import PayRunTable from "@/components/admin/payroll/pay-run-table";
import type { PeriodSelection } from "@/hooks/use-period-selection";
import type {
  PeriodRun,
  PeriodStatus,
  PeriodView,
} from "@/lib/payroll/period-view";

type PayRunListProps = {
  runs: PeriodRun[];
  periodStatus: PeriodStatus;
  totals: PeriodView["totals"];
  // Lifted to the period workspace (useExpandedRuns), so stragglers and Add Cleaner can open a row.
  expandedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  selection: PeriodSelection | null;
  isSelectionDisabled: boolean;
};

// The period's runs: a table at xl, cards below. Any number of ledgers can be open at once.
export default function PayRunList({
  runs,
  periodStatus,
  totals,
  expandedKeys,
  onToggle,
  selection,
  isSelectionDisabled,
}: PayRunListProps): React.ReactNode {
  return (
    <div className="space-y-3">
      <PayRunTable
        runs={runs}
        periodStatus={periodStatus}
        totals={totals}
        expandedKeys={expandedKeys}
        onToggle={onToggle}
        selection={selection}
        isSelectionDisabled={isSelectionDisabled}
      />
      <PayRunCards
        runs={runs}
        periodStatus={periodStatus}
        totals={totals}
        expandedKeys={expandedKeys}
        onToggle={onToggle}
        selection={selection}
        isSelectionDisabled={isSelectionDisabled}
      />
    </div>
  );
}
