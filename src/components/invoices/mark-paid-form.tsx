"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Field, FieldError } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import SubmitButton from "@/components/ui/submit-button";
import usePaymentSheetSubmit, {
  type SheetFieldErrors,
} from "@/hooks/use-payment-sheet-submit";
import { markAppointmentsPaid } from "@/lib/actions/invoices";
import type { PaymentMethod } from "@/lib/invoices/ledger";
import {
  amountInputValue,
  appointmentDateLabel,
  markPaidNotes,
  type MarkPaidAppointment,
} from "@/lib/invoices/mark-paid";
import {
  AMOUNT_TOO_LARGE_MESSAGE,
  formatCents,
  parseDollarsToCents,
} from "@/lib/pricing/money";

import PaymentFields from "./payment-fields";
import type { PaymentMethodFieldHandle } from "./payment-method-field";
import { SHEET_BUTTON_CLASS, SheetButtons } from "./sheet-buttons";

type MarkPaidFormProps = {
  clientId: string;
  appointments: MarkPaidAppointment[];
  methods: PaymentMethod[];
  businessDate: string;
  onCancel: () => void;
  onSuccess: () => void;
  onRefusal: () => void;
  onPendingChange: (isPending: boolean) => void;
};

const AMOUNT_MESSAGE = "Type an amount of $0 or more.";
const METHOD_MESSAGE = "Choose a payment method.";

function amountKey(appointmentId: string): string {
  return `amount:${appointmentId}`;
}

// Mark paid: one new invoice for these appointments, issued and paid at once.
export default function MarkPaidForm({
  clientId,
  appointments,
  methods,
  businessDate,
  onCancel,
  onSuccess,
  onRefusal,
  onPendingChange,
}: MarkPaidFormProps): React.ReactNode {
  const amountIdPrefix = useId();
  const paidDateRef = useRef<HTMLInputElement>(null);
  const methodRef = useRef<PaymentMethodFieldHandle>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      appointments.map((appointment) => [
        appointment.id,
        amountInputValue(appointment.livePriceCents),
      ]),
    ),
  );

  // Blank, invalid or over-cap rows count as $0 until they're fixed.
  const totalCents = appointments.reduce((sum, appointment) => {
    const amount = parseDollarsToCents(amounts[appointment.id] ?? "");
    return sum + ("cents" in amount ? amount.cents : 0);
  }, 0);

  function validate(formData: FormData): SheetFieldErrors {
    const errors: SheetFieldErrors = {};
    for (const appointment of appointments) {
      const amount = parseDollarsToCents(amounts[appointment.id] ?? "");
      if ("error" in amount) {
        errors[amountKey(appointment.id)] =
          amount.error === "too_large"
            ? AMOUNT_TOO_LARGE_MESSAGE
            : AMOUNT_MESSAGE;
      }
    }
    if (!String(formData.get("payment_method") ?? "")) {
      errors.method = METHOD_MESSAGE;
    }
    return errors;
  }

  function focusField(key: string): void {
    if (key === "paidDate") {
      paidDateRef.current?.focus();
    } else if (key === "method") {
      methodRef.current?.focus();
    } else {
      document.getElementById(`${amountIdPrefix}-${key}`)?.focus();
    }
  }

  const { fieldErrors, formError, isPending, handleSubmit } = usePaymentSheetSubmit({
    action: markAppointmentsPaid,
    validate,
    focusField,
    onSuccess: ({ invoiceNumber }) => {
      toast.success(`Invoice ${invoiceNumber} created and marked paid`);
      onSuccess();
    },
    onRefusal,
  });

  return (
    // noValidate: every check shows under its field instead of the browser's bubble.
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <input type="hidden" name="client_id" value={clientId} />
      {appointments.map((appointment) => (
        <input
          key={appointment.id}
          type="hidden"
          name="appointment_ids"
          value={appointment.id}
        />
      ))}

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Creates an invoice for these appointments, issued and paid in one
          step. It isn&apos;t sent to the client.
        </p>
        <ul className="divide-y rounded-lg border">
          {appointments.map((appointment) => {
            const key = amountKey(appointment.id);
            const inputId = `${amountIdPrefix}-${key}`;
            const error = fieldErrors[key] ?? null;
            const title = `${appointmentDateLabel(appointment.scheduledDate, businessDate)} · ${appointment.jobName}`;
            return (
              <li
                key={appointment.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{title}</p>
                  {markPaidNotes(appointment).map((note) => (
                    <p key={note} className="text-xs text-muted-foreground">
                      {note}
                    </p>
                  ))}
                </div>
                <Field
                  data-invalid={error ? true : undefined}
                  className="w-32 shrink-0"
                >
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>$</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id={inputId}
                      name={`amount_${appointment.id}`}
                      value={amounts[appointment.id] ?? ""}
                      onChange={(event) =>
                        setAmounts({
                          ...amounts,
                          [appointment.id]: event.target.value,
                        })
                      }
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint="next"
                      aria-label={`Amount for ${title}`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${inputId}-error` : undefined}
                      className="text-right tabular-nums"
                    />
                  </InputGroup>
                  {error ? (
                    <FieldError id={`${inputId}-error`}>{error}</FieldError>
                  ) : null}
                </Field>
              </li>
            );
          })}
        </ul>
        <p className="flex justify-between border-t pt-3 text-sm font-semibold tabular-nums">
          <span>Total</span>
          <span>{formatCents(totalCents)}</span>
        </p>
      </div>

      <PaymentFields
        methods={methods}
        businessDate={businessDate}
        errors={{
          paidDate: fieldErrors.paidDate ?? null,
          method: fieldErrors.method ?? null,
        }}
        paidDateRef={paidDateRef}
        methodRef={methodRef}
      />

      {formError ? (
        <Alert
          variant="destructive"
          className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart"
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Couldn&apos;t mark paid</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <SheetButtons
        onCancel={onCancel}
        onPendingChange={onPendingChange}
        isPending={isPending}
      >
        <SubmitButton
          label={`Mark paid · ${formatCents(totalCents)}`}
          pendingLabel="Marking paid…"
          isPending={isPending}
          className={SHEET_BUTTON_CLASS}
        />
      </SheetButtons>
    </form>
  );
}
