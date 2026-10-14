"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import SubmitButton from "@/components/ui/submit-button";
import { archivePayRate, restorePayRate } from "@/lib/actions/pay-rates";
import { DUPLICATE_RATE_DATE_MESSAGE } from "@/lib/employees/pay-rate-form";
import type { PayRateRow } from "@/lib/employees/pay-rates-view";
import { formatDateOnly } from "@/lib/invoices/view";

type PayRateStateButtonProps = {
  rate: PayRateRow;
  // Tells the row a change is in flight, so it can disable Edit.
  onPendingChange: (isPending: boolean) => void;
};

// One tap, no confirm: an archived rate comes back from Archived.
export default function PayRateStateButton({
  rate,
  onPendingChange,
}: PayRateStateButtonProps): React.ReactNode {
  const router = useRouter();
  const isRestore = rate.is_archived;

  async function handleChange(): Promise<null> {
    let refusal: string | null = null;
    let isSuccess = false;
    try {
      const result = isRestore
        ? await restorePayRate(rate.id)
        : await archivePayRate(rate.id);
      isSuccess = result.success;
      if (!result.success) {
        console.warn("Pay rate state change refused", rate.id, result.error);
        refusal = result.error;
      }
    } catch (error) {
      console.error("Pay rate state change failed", rate.id, error);
    }

    if (isSuccess) {
      if (isRestore) {
        toast.success("Pay rate restored");
      } else {
        toast.success("Pay rate archived", {
          description: "Restore it from Archived.",
        });
      }
      router.refresh();
    } else if (refusal === DUPLICATE_RATE_DATE_MESSAGE) {
      toast.error(DUPLICATE_RATE_DATE_MESSAGE);
    } else {
      const verb = isRestore ? "restore" : "archive";
      toast.error(`Couldn't ${verb} the Pay rate. Try again.`);
    }
    return null;
  }

  const [, formAction, isPending] = useActionState(handleChange, null);

  useEffect(() => {
    onPendingChange(isPending);
  }, [isPending, onPendingChange]);

  const verb = isRestore ? "Restore" : "Archive";
  const Icon = isRestore ? RotateCcw : Archive;

  return (
    <form action={formAction} className="contents">
      <SubmitButton
        variant="outline"
        className={OUTLINE_PRESS_CLASS_NAME}
        label={verb}
        pendingLabel={isRestore ? "Restoring…" : "Archiving…"}
        icon={<Icon aria-hidden="true" />}
        isPending={isPending}
        aria-label={`${verb} Pay rate from ${formatDateOnly(rate.effective_from)}`}
      />
    </form>
  );
}
