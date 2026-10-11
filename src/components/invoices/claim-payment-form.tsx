"use client";

import { useRef } from "react";
import { AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import SubmitButton from "@/components/ui/submit-button";
import usePaymentSheetSubmit, {
  type SheetFieldErrors,
} from "@/hooks/use-payment-sheet-submit";
import { recordPayment } from "@/lib/actions/invoices";
import type { PaymentMethod } from "@/lib/invoices/ledger";
import { formatCents } from "@/lib/pricing/money";

import PaymentFields from "./payment-fields";
import type { PaymentMethodFieldHandle } from "./payment-method-field";
import { SHEET_BUTTON_CLASS, SheetButtons } from "./sheet-buttons";

type ClaimPaymentFormProps = {
  invoiceId: string;
  invoiceNumber: string;
  totalCents: number | null;
  methods: PaymentMethod[];
  businessDate: string;
  onCancel: () => void;
  onSuccess: () => void;
  onRefusal: () => void;
  onPendingChange: (isPending: boolean) => void;
};

const METHOD_MESSAGE = "Choose a payment method.";

// Record payment for the issued invoice an appointment is on: payments are in full, so it pays
// the whole invoice.
export default function ClaimPaymentForm({
  invoiceId,
  invoiceNumber,
  totalCents,
  methods,
  businessDate,
  onCancel,
  onSuccess,
  onRefusal,
  onPendingChange,
}: ClaimPaymentFormProps): React.ReactNode {
  const paidDateRef = useRef<HTMLInputElement>(null);
  const methodRef = useRef<PaymentMethodFieldHandle>(null);

  function validate(formData: FormData): SheetFieldErrors {
    return String(formData.get("payment_method") ?? "")
      ? {}
      : { method: METHOD_MESSAGE };
  }

  function focusField(key: string): void {
    if (key === "paidDate") {
      paidDateRef.current?.focus();
    } else {
      methodRef.current?.focus();
    }
  }

  const { fieldErrors, formError, isPending, handleSubmit } = usePaymentSheetSubmit({
    action: recordPayment,
    validate,
    focusField,
    onSuccess: () => {
      toast.success(`Payment recorded on ${invoiceNumber}`);
      onSuccess();
    },
    onRefusal,
  });

  const heading =
    totalCents === null
      ? invoiceNumber
      : `${invoiceNumber} · ${formatCents(totalCents)}`;

  return (
    // noValidate: every check shows under its field instead of the browser's bubble.
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <input type="hidden" name="invoice_id" value={invoiceId} />

      <Alert>
        <Info aria-hidden="true" />
        <AlertTitle>{heading}</AlertTitle>
        <AlertDescription>
          Payments are in full: recording one marks the whole invoice and every
          appointment on it Paid.
        </AlertDescription>
      </Alert>

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
          <AlertTitle>Couldn&apos;t record the payment</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <SheetButtons
        onCancel={onCancel}
        onPendingChange={onPendingChange}
        isPending={isPending}
      >
        <SubmitButton
          label="Record payment"
          pendingLabel="Recording…"
          isPending={isPending}
          className={SHEET_BUTTON_CLASS}
        />
      </SheetButtons>
    </form>
  );
}
