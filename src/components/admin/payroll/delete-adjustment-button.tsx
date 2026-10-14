"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { usePeriodActions } from "@/components/admin/payroll/period-actions-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deletePayAdjustment } from "@/lib/actions/payroll";
import { requestAction } from "@/lib/payroll/request-action";
import { cn } from "@/lib/utils";

type DeleteAdjustmentButtonProps = {
  adjustmentId: string;
  reason: string;
};

const DELETE_FAILED_MESSAGE = "Couldn't delete the Adjustment. Try again.";

// No confirm: an Adjustment is cheap to add back. data-pending dims its line (AdjustmentRow).
export default function DeleteAdjustmentButton({
  adjustmentId,
  reason,
}: DeleteAdjustmentButtonProps): React.ReactNode {
  const periodActions = usePeriodActions();
  const [isPending, startTransition] = useTransition();

  // Only the period page, which provides the actions, can delete.
  if (periodActions === null) return null;
  const { periodStart } = periodActions;

  function handleClick(): void {
    startTransition(async () => {
      const result = await requestAction("delete adjustment", () =>
        deletePayAdjustment(adjustmentId, periodStart),
      );
      if (result === null) return;

      if (result.error === null) {
        toast.success("Adjustment deleted");
      } else {
        toast.error(result.error || DELETE_FAILED_MESSAGE);
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={isPending}
      aria-busy={isPending}
      data-pending={isPending || undefined}
      aria-label={`Delete Adjustment ${reason}`}
      className={cn("-my-1 shrink-0", OUTLINE_PRESS_CLASS_NAME)}
      onClick={handleClick}
    >
      {isPending ? (
        <Spinner
          aria-hidden="true"
          role="presentation"
          aria-label={undefined}
        />
      ) : (
        <Trash2 aria-hidden="true" />
      )}
    </Button>
  );
}
