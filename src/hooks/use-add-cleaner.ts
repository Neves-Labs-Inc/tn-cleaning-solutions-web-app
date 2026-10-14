import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addCleanerToPayPeriod } from "@/lib/actions/payroll";
import {
  getFirstName,
  type CleanerCandidate,
} from "@/lib/payroll/period-actions";
import { requestAction } from "@/lib/payroll/request-action";

export type AddCleaner = {
  isPending: boolean;
  // The row being added, for its spinner.
  pendingId: string | null;
  refusal: string | null;
  add: (candidate: CleanerCandidate) => void;
  clearRefusal: () => void;
};

type AddCleanerInput = {
  periodStart: string;
  periodLabel: string;
  onAdded: (employeeId: string) => void;
};

const SERVER_ERROR_STATUS = 500;

// Adds a Cleaner with no run to an ended period: a $0 regular draft she can get an Adjustment on.
export function useAddCleaner({
  periodStart,
  periodLabel,
  onAdded,
}: AddCleanerInput): AddCleaner {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  function add(candidate: CleanerCandidate): void {
    setRefusal(null);
    setPendingId(candidate.id);
    startTransition(async () => {
      const result = await requestAction("add cleaner", () =>
        addCleanerToPayPeriod(candidate.id, periodStart),
      );
      if (result === null) return;

      if (result.error === null) {
        toast.success(
          `Added ${getFirstName(candidate.name)} to ${periodLabel}`,
        );
        onAdded(candidate.id);
      } else if (result.status >= SERVER_ERROR_STATUS) {
        toast.error(result.error);
      } else {
        setRefusal(result.error);
      }
    });
  }

  return {
    isPending,
    pendingId: isPending ? pendingId : null,
    refusal,
    add,
    clearRefusal: () => setRefusal(null),
  };
}
