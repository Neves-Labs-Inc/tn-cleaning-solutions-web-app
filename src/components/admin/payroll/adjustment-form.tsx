"use client";

import { useId, useRef } from "react";
import { AlertCircle } from "lucide-react";

import {
  OUTLINE_PRESS_CLASS_NAME,
  PRESS_CLASS_NAME,
} from "@/components/admin/detail-page/press";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import SubmitButton from "@/components/ui/submit-button";
import { useAdjustmentForm } from "@/hooks/use-adjustment-form";
import type { AdjustmentFieldErrors } from "@/lib/payroll/action-input";
import {
  formatDayLabel,
  NO_CLIENT_LABEL,
  NO_JOB_LABEL,
} from "@/lib/payroll/format";
import type { LedgerEntry } from "@/lib/payroll/ledger";
import { cn } from "@/lib/utils";

type AdjustmentFormProps = {
  employeeId: string;
  cleanerName: string;
  periodStart: string;
  // The run's lines, for the Appointment select.
  lines: LedgerEntry[];
  // Called after a save or a Cancel; the section closes the form.
  onDone: () => void;
};

const REASON_PLACEHOLDER = "Tip paid through the business, gas, expense, fix…";

function getLineLabel(line: LedgerEntry): string {
  return [
    formatDayLabel(line.date),
    line.jobName ?? NO_JOB_LABEL,
    line.clientName ?? NO_CLIENT_LABEL,
  ].join(" · ");
}

// One Adjustment for the run: a signed amount, a reason the Cleaner sees, and optionally the
// appointment it's about.
export default function AdjustmentForm({
  employeeId,
  cleanerName,
  periodStart,
  lines,
  onDone,
}: AdjustmentFormProps): React.ReactNode {
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const appointmentRef = useRef<HTMLSelectElement>(null);
  const ids = {
    amount: useId(),
    amountHint: useId(),
    amountError: useId(),
    reason: useId(),
    reasonError: useId(),
    appointment: useId(),
    appointmentError: useId(),
  };

  function handleInvalid(errors: AdjustmentFieldErrors): void {
    let field: HTMLElement | null = appointmentRef.current;
    if (errors.amount !== undefined) {
      field = amountRef.current;
    } else if (errors.reason !== undefined) {
      field = reasonRef.current;
    }
    field?.focus();
  }

  function handleSaved(): void {
    formRef.current?.reset();
    onDone();
  }

  const form = useAdjustmentForm({
    employeeId,
    cleanerName,
    periodStart,
    onInvalid: handleInvalid,
    onSaved: handleSaved,
  });
  const { fieldErrors } = form;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    // Not a form action: React would reset the inputs even when a field is refused.
    event.preventDefault();
    form.submit(new FormData(event.currentTarget));
  }

  function handleCancel(): void {
    form.reset();
    onDone();
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border bg-muted/50 p-3"
    >
      <p className="text-sm font-medium">New Adjustment</p>
      <div className="grid gap-3 @md:grid-cols-[10rem_1fr]">
        <Field data-invalid={fieldErrors.amount !== undefined || undefined}>
          <FieldLabel htmlFor={ids.amount}>Amount</FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <InputGroupText>$</InputGroupText>
            </InputGroupAddon>
            {/* No inputMode="decimal": the iOS decimal pad has no minus key. */}
            <InputGroupInput
              ref={amountRef}
              id={ids.amount}
              name="amount"
              autoComplete="off"
              enterKeyHint="next"
              placeholder="-12.50"
              aria-invalid={fieldErrors.amount !== undefined || undefined}
              aria-describedby={
                fieldErrors.amount === undefined
                  ? ids.amountHint
                  : `${ids.amountHint} ${ids.amountError}`
              }
            />
          </InputGroup>
          <FieldDescription id={ids.amountHint}>
            Use a minus sign to take money off.
          </FieldDescription>
          <FieldError id={ids.amountError}>{fieldErrors.amount}</FieldError>
        </Field>
        <Field data-invalid={fieldErrors.reason !== undefined || undefined}>
          <FieldLabel htmlFor={ids.reason}>Reason</FieldLabel>
          <Input
            ref={reasonRef}
            id={ids.reason}
            name="reason"
            autoComplete="off"
            enterKeyHint="next"
            placeholder={REASON_PLACEHOLDER}
            aria-invalid={fieldErrors.reason !== undefined || undefined}
            aria-describedby={
              fieldErrors.reason === undefined ? undefined : ids.reasonError
            }
          />
          <FieldError id={ids.reasonError}>{fieldErrors.reason}</FieldError>
        </Field>
      </div>
      <Field data-invalid={fieldErrors.appointment !== undefined || undefined}>
        <FieldLabel htmlFor={ids.appointment}>
          Appointment (optional)
        </FieldLabel>
        <NativeSelect
          ref={appointmentRef}
          id={ids.appointment}
          name="appointment_employee_id"
          defaultValue=""
          className="w-full"
          aria-invalid={fieldErrors.appointment !== undefined || undefined}
          aria-describedby={
            fieldErrors.appointment === undefined
              ? undefined
              : ids.appointmentError
          }
        >
          <NativeSelectOption value="">None, the whole run</NativeSelectOption>
          {lines.map((line) => (
            <NativeSelectOption
              key={line.appointmentEmployeeId}
              value={line.appointmentEmployeeId}
            >
              {getLineLabel(line)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <FieldError id={ids.appointmentError}>
          {fieldErrors.appointment}
        </FieldError>
      </Field>
      {form.refusal === null ? null : (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription role="alert">{form.refusal}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <SubmitButton
          label="Add Adjustment"
          pendingLabel="Adding…"
          isPending={form.isPending}
          className={cn("flex-1 md:flex-none", PRESS_CLASS_NAME)}
        />
        <Button
          type="button"
          variant="ghost"
          disabled={form.isPending}
          className={cn("flex-1 md:flex-none", OUTLINE_PRESS_CLASS_NAME)}
          onClick={handleCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
