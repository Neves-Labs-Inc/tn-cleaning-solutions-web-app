"use client";

import { createContext, useContext } from "react";

import type { ExpandOptions } from "@/hooks/use-expanded-runs";

// What the action controls deep in a run's ledger need about the period they act on. Provided by
// PeriodWorkspace; null on a page with no actions (the ledger then renders read-only).
export type PeriodActions = {
  periodStart: string;
  // "Oct 5–18", for toasts.
  periodLabel: string;
  isEnded: boolean;
  // Cleaners with an off-cycle run in the period: their regular run can't be undone.
  offCycleCleanerIds: ReadonlySet<string>;
  // Cleaners with an unpaid off-cycle run: new Adjustments land there, not on the regular run.
  unpaidOffCycleCleanerIds: ReadonlySet<string>;
  // Each Cleaner's off-cycle draft row, for "Open off-cycle run".
  offCycleDraftKeys: ReadonlyMap<string, string>;
  adjustmentFormKeys: ReadonlySet<string>;
  expand: (key: string, options?: ExpandOptions) => void;
  // After Remove from period: focus Add Cleaner once the row is gone.
  focusAddCleaner: () => void;
};

export const PeriodActionsContext = createContext<PeriodActions | null>(null);

export function usePeriodActions(): PeriodActions | null {
  return useContext(PeriodActionsContext);
}
