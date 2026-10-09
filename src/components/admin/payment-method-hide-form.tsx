"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import SubmitButton from "@/components/ui/submit-button";
import { setPaymentMethodHidden } from "@/lib/actions/invoices";
import type { PaymentMethod } from "@/lib/invoices/ledger";

type PaymentMethodHideFormProps = {
  method: PaymentMethod;
  onPendingChange: (isPending: boolean) => void;
  onFailedChange: (hasFailed: boolean) => void;
};

// State set inside a form action only commits when the action ends, so the row
// learns about pending from useFormStatus in a child of the form.
function PendingSync({
  onChange,
}: {
  onChange: (isPending: boolean) => void;
}): null {
  const { pending } = useFormStatus();

  useEffect(() => {
    onChange(pending);
  }, [pending, onChange]);

  return null;
}

// Hide and Unhide are one control: the button flips with the row's is_hidden.
export default function PaymentMethodHideForm({
  method,
  onPendingChange,
  onFailedChange,
}: PaymentMethodHideFormProps): React.ReactNode {
  const willHide = !method.is_hidden;

  async function handleSubmit(formData: FormData): Promise<void> {
    onFailedChange(false);
    let isOk = false;
    try {
      const result = await setPaymentMethodHidden(null, formData);
      isOk = result.success;
    } catch (error) {
      // A dropped connection rejects the action; show the same inline failure.
      console.error("setPaymentMethodHidden failed:", error);
    }

    if (isOk) {
      toast.success(
        willHide
          ? `"${method.name}" is hidden from the payment picker.`
          : `"${method.name}" is back in the payment picker.`,
      );
    } else {
      onFailedChange(true);
    }
  }

  return (
    <form action={handleSubmit} className="contents">
      <PendingSync onChange={onPendingChange} />
      <input type="hidden" name="payment_method_id" value={method.id} />
      <input type="hidden" name="is_hidden" value={String(willHide)} />
      <SubmitButton
        variant="outline"
        className="active:scale-[0.98]"
        label={willHide ? "Hide" : "Unhide"}
        pendingLabel={willHide ? "Hiding…" : "Unhiding…"}
        icon={
          willHide ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />
        }
      />
    </form>
  );
}
