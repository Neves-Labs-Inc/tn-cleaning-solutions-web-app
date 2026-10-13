"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import SubmitButton from "@/components/ui/submit-button";
import { useAppointmentsCache } from "@/hooks/use-appointments-cache";
import {
  archiveClientJobPricing,
  restoreClientJobPricing,
} from "@/lib/actions/client-job-pricing";
import type { ClientJobPricingRow } from "@/lib/clients/pricing-view";
import { formatDateOnly } from "@/lib/invoices/view";

type RateStateButtonProps = {
  row: ClientJobPricingRow;
  // Tells the row a change is in flight, so it can disable Edit.
  onPendingChange: (isPending: boolean) => void;
};

// One tap, no confirm: an archived rate comes back from History.
export default function RateStateButton({
  row,
  onPendingChange,
}: RateStateButtonProps): React.ReactNode {
  const router = useRouter();
  const appointmentsCache = useAppointmentsCache();
  const isRestore = row.is_archived;
  const rateName = `${row.job_name} rate`;

  async function handleChange(): Promise<null> {
    let isSuccess = false;
    try {
      const result = isRestore
        ? await restoreClientJobPricing(row.id)
        : await archiveClientJobPricing(row.id);
      isSuccess = result.success;
      if (!result.success) {
        console.warn("Rate state change refused", row.id, result.error);
      }
    } catch (error) {
      console.error("Rate state change failed", row.id, error);
    }

    if (isSuccess) {
      // Appointment prices follow the rate in force, so cached prices are stale now.
      void appointmentsCache.refresh();
      if (isRestore) {
        toast.success(`${rateName} restored`);
      } else {
        toast.success(`${rateName} archived`, {
          description: "Restore it from History.",
        });
      }
      router.refresh();
    } else {
      const verb = isRestore ? "restore" : "archive";
      toast.error(`Couldn't ${verb} the ${rateName}. Try again.`);
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
        aria-label={`${verb} ${rateName} from ${formatDateOnly(row.effective_from)}`}
      />
    </form>
  );
}
