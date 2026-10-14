"use client";

import { useState } from "react";

import PayRunCards from "@/components/admin/payroll/pay-run-cards";
import PayRunTable from "@/components/admin/payroll/pay-run-table";
import type { PeriodRun, PeriodStatus, PeriodView } from "@/lib/payroll/period-view";

type PayRunListProps = {
  runs: PeriodRun[];
  periodStatus: PeriodStatus;
  totals: PeriodView["totals"];
};

// The period's runs: a table at xl, cards below. Any number of ledgers can be open at once.
export default function PayRunList({
  runs,
  periodStatus,
  totals,
}: PayRunListProps): React.ReactNode {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  function handleToggle(key: string): void {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <PayRunTable
        runs={runs}
        periodStatus={periodStatus}
        totals={totals}
        expandedKeys={expandedKeys}
        onToggle={handleToggle}
      />
      <PayRunCards
        runs={runs}
        periodStatus={periodStatus}
        totals={totals}
        expandedKeys={expandedKeys}
        onToggle={handleToggle}
      />
    </div>
  );
}
