"use client";

import { AlertCircle } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef } from "react";

import {
  SHEET_BUTTON_CLASS,
  SheetButtons,
} from "@/components/invoices/sheet-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import SubmitButton from "@/components/ui/submit-button";
import {
  createPayRate,
  type PayRateActionResult,
  updatePayRate,
} from "@/lib/actions/pay-rates";
import type { PayRateRow } from "@/lib/employees/pay-rates-view";

type PayRateFormProps = {
  employeeId: string;
  // Absent when adding.
  rate?: PayRateRow;
  defaultEffectiveFrom: string;
  onSuccess: () => void;
  onCancel: () => void;
  onPendingChange: (isPending: boolean) => void;
};

const initialState: PayRateActionResult = { success: false, error: "" };

const SAVE_FAILED_MESSAGE = "Couldn't save the rate. Try again.";
const RATE_HELP_ID = "pay-rate-help";
const RATE_ERROR_ID = "pay-rate-error";
const DATE_HELP_ID = "pay-rate-date-help";
const DATE_ERROR_ID = "pay-rate-date-error";

function joinIds(...ids: Array<string | false>): string | undefined {
  const present = ids.filter((id): id is string => Boolean(id));
  return present.length > 0 ? present.join(" ") : undefined;
}

// Lives inside a ResponsiveDialog: the sheet is the surface, so no card of its own.
export function PayRateForm({
  employeeId,
  rate,
  defaultEffectiveFrom,
  onSuccess,
  onCancel,
  onPendingChange,
}: PayRateFormProps): React.ReactNode {
  const rateRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const isEditMode = rate !== undefined;
  const saveAction = rate
    ? updatePayRate.bind(null, rate.id)
    : createPayRate.bind(null, employeeId);

  async function handleSave(
    previous: PayRateActionResult,
    formData: FormData,
  ): Promise<PayRateActionResult> {
    let result: PayRateActionResult;
    try {
      result = await saveAction(previous, formData);
    } catch (error) {
      console.error("Pay rate save failed", rate?.id ?? employeeId, error);
      result = { success: false, error: SAVE_FAILED_MESSAGE };
    }

    if (result.success) {
      onSuccess();
    }
    return result;
  }

  const [state, formAction, isPending] = useActionState(
    handleSave,
    initialState,
  );
  const fieldErrors = "fieldErrors" in state ? state.fieldErrors : undefined;
  const formError = !state.success && !fieldErrors ? state.error : "";

  // A refused save puts focus on the first field to fix.
  useEffect(() => {
    if (fieldErrors?.hourly_rate_cents) {
      rateRef.current?.focus();
    } else if (fieldErrors?.effective_from) {
      dateRef.current?.focus();
    }
  }, [fieldErrors]);

  // Dispatched by hand rather than through <form action>: React resets an action form's fields
  // after every submit, and a refused save must keep what the admin typed.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Field data-invalid={Boolean(fieldErrors?.hourly_rate_cents)}>
        <FieldLabel htmlFor="pay-rate">Pay rate ($/hour)</FieldLabel>
        <Input
          ref={rateRef}
          id="pay-rate"
          name="hourly_rate_cents"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          enterKeyHint="next"
          required
          defaultValue={rate ? (rate.hourly_rate_cents / 100).toFixed(2) : ""}
          aria-invalid={Boolean(fieldErrors?.hourly_rate_cents)}
          aria-describedby={joinIds(
            RATE_HELP_ID,
            Boolean(fieldErrors?.hourly_rate_cents) && RATE_ERROR_ID,
          )}
        />
        <FieldDescription id={RATE_HELP_ID}>
          Paid per worked hour. A Job pay premium adds on top.
        </FieldDescription>
        {fieldErrors?.hourly_rate_cents ? (
          <FieldError id={RATE_ERROR_ID}>
            {fieldErrors.hourly_rate_cents}
          </FieldError>
        ) : null}
      </Field>

      <Field data-invalid={Boolean(fieldErrors?.effective_from)}>
        <FieldLabel htmlFor="pay-rate-date">Effective from</FieldLabel>
        <Input
          ref={dateRef}
          id="pay-rate-date"
          name="effective_from"
          type="date"
          enterKeyHint="done"
          required
          defaultValue={rate?.effective_from ?? defaultEffectiveFrom}
          aria-invalid={Boolean(fieldErrors?.effective_from)}
          aria-describedby={joinIds(
            DATE_HELP_ID,
            Boolean(fieldErrors?.effective_from) && DATE_ERROR_ID,
          )}
        />
        <FieldDescription id={DATE_HELP_ID}>
          Applies to her shifts on or after this date. Shifts on a paid Pay run
          keep their rate.
        </FieldDescription>
        {fieldErrors?.effective_from ? (
          <FieldError id={DATE_ERROR_ID}>{fieldErrors.effective_from}</FieldError>
        ) : null}
      </Field>

      {formError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <SheetButtons
        onCancel={onCancel}
        onPendingChange={onPendingChange}
        isPending={isPending}
      >
        <SubmitButton
          className={SHEET_BUTTON_CLASS}
          label={isEditMode ? "Save changes" : "Add rate"}
          pendingLabel={isEditMode ? "Saving…" : "Adding…"}
          isPending={isPending}
        />
      </SheetButtons>
    </form>
  );
}
