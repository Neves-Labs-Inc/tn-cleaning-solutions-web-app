"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  OUTLINE_PRESS_CLASS_NAME,
  PRESS_CLASS_NAME,
} from "@/components/admin/detail-page/press";
import { usePeriodActions } from "@/components/admin/payroll/period-actions-context";
import { Button } from "@/components/ui/button";
import SubmitButton from "@/components/ui/submit-button";
import { startOffCycleRun } from "@/lib/actions/payroll";
import { getFirstName } from "@/lib/payroll/period-actions";
import { getRunKey, type RunCleaner } from "@/lib/payroll/period-view";
import { requestAction } from "@/lib/payroll/request-action";
import { cn } from "@/lib/utils";

type OffCycleButtonProps = {
  cleaner: RunCleaner;
};

const SERVER_ERROR_STATUS = 500;
const BUTTON_CLASS_NAME = "w-full sm:w-auto";

// A straggler's next step: start the Cleaner's off-cycle run, or open the one already started.
export default function OffCycleButton({
  cleaner,
}: OffCycleButtonProps): React.ReactNode {
  const periodActions = usePeriodActions();
  const [isPending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);

  if (periodActions === null) return null;
  const { periodStart, expand } = periodActions;
  // The Cleaner's off-cycle draft row, once started.
  const offCycleKey = periodActions.offCycleDraftKeys.get(cleaner.id) ?? null;

  function handleStart(): void {
    setRefusal(null);
    startTransition(async () => {
      const result = await requestAction("start off-cycle run", () =>
        startOffCycleRun(cleaner.id, periodStart),
      );
      if (result === null) return;

      if (result.value !== null) {
        toast.success(`Started ${getFirstName(cleaner.name)}'s off-cycle run`);
        expand(getRunKey(cleaner.id, "off_cycle", result.value.runId));
      } else if (result.status >= SERVER_ERROR_STATUS) {
        toast.error(result.error);
      } else {
        // The action refreshed the page, so on draft_exists this button now reads Open.
        setRefusal(result.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      {offCycleKey === null ? (
        <SubmitButton
          label="Start off-cycle run"
          pendingLabel="Starting…"
          isPending={isPending}
          className={cn(BUTTON_CLASS_NAME, PRESS_CLASS_NAME)}
          onClick={handleStart}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          className={cn(BUTTON_CLASS_NAME, OUTLINE_PRESS_CLASS_NAME)}
          onClick={() => expand(offCycleKey)}
        >
          Open off-cycle run
        </Button>
      )}
      {refusal === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {refusal}
        </p>
      )}
    </div>
  );
}
