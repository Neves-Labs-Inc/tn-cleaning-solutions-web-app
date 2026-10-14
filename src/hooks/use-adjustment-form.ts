import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addPayAdjustment } from "@/lib/actions/payroll";
import type { AdjustmentFieldErrors } from "@/lib/payroll/action-input";
import { getFirstName } from "@/lib/payroll/period-actions";
import { requestAction } from "@/lib/payroll/request-action";

export type AdjustmentForm = {
  isPending: boolean;
  fieldErrors: AdjustmentFieldErrors;
  // A run-level refusal (run_paid, period_not_ended, appointment_not_on_run), shown above the buttons.
  refusal: string | null;
  submit: (formData: FormData) => void;
  reset: () => void;
};

type AdjustmentFormInput = {
  employeeId: string;
  cleanerName: string;
  periodStart: string;
  // The first invalid field, so focus can move to it.
  onInvalid: (fieldErrors: AdjustmentFieldErrors) => void;
  onSaved: () => void;
};

const SERVER_ERROR_STATUS = 500;

// Submits one Add Adjustment form. Validation is on submit, by the server action's parser; the
// form keeps what was typed until it saves.
export function useAdjustmentForm({
  employeeId,
  cleanerName,
  periodStart,
  onInvalid,
  onSaved,
}: AdjustmentFormInput): AdjustmentForm {
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<AdjustmentFieldErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);

  function reset(): void {
    setFieldErrors({});
    setRefusal(null);
  }

  function submit(formData: FormData): void {
    reset();
    startTransition(async () => {
      const result = await requestAction("add adjustment", () =>
        addPayAdjustment(employeeId, periodStart, formData),
      );
      if (result === null) return;

      const errors = result.fieldErrors ?? {};

      if (result.error === null) {
        toast.success(`Adjustment added to ${getFirstName(cleanerName)}'s run`);
        onSaved();
      } else if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        onInvalid(errors);
      } else if (result.status >= SERVER_ERROR_STATUS) {
        toast.error(result.error);
      } else {
        setRefusal(result.error);
      }
    });
  }

  return { isPending, fieldErrors, refusal, submit, reset };
}
