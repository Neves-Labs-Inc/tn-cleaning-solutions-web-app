"use client";

import { useId, useState } from "react";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PaymentMethod } from "@/lib/invoices/ledger";

import PaymentMethodField, {
  type PaymentMethodFieldHandle,
} from "./payment-method-field";

export type PaymentFieldErrors = { paidDate: string | null; method: string | null };

type PaymentFieldsProps = {
  methods: PaymentMethod[];
  businessDate: string;
  errors: PaymentFieldErrors;
  paidDateRef: React.Ref<HTMLInputElement>;
  methodRef: React.Ref<PaymentMethodFieldHandle>;
};

// Paid on, Method and Reference for a new payment in a sheet. No method is preselected and the
// methods page isn't linked, as leaving would drop the sheet. Posts paid_date, payment_method and
// payment_reference.
export default function PaymentFields({
  methods,
  businessDate,
  errors,
  paidDateRef,
  methodRef,
}: PaymentFieldsProps): React.ReactNode {
  const ids = { paidDate: useId(), paidDateError: useId(), reference: useId() };
  // Controlled, so a refused submit doesn't reset what the admin typed.
  const [paidDate, setPaidDate] = useState(businessDate);
  const [reference, setReference] = useState("");

  return (
    <>
      <Field data-invalid={errors.paidDate ? true : undefined}>
        <FieldLabel htmlFor={ids.paidDate}>Paid on</FieldLabel>
        <Input
          ref={paidDateRef}
          id={ids.paidDate}
          name="paid_date"
          type="date"
          max={businessDate}
          value={paidDate}
          onChange={(event) => setPaidDate(event.target.value)}
          aria-invalid={errors.paidDate ? true : undefined}
          aria-describedby={errors.paidDate ? ids.paidDateError : undefined}
          className="hover:border-foreground/30"
        />
        {errors.paidDate ? (
          <FieldError id={ids.paidDateError}>{errors.paidDate}</FieldError>
        ) : null}
      </Field>

      <PaymentMethodField
        ref={methodRef}
        methods={methods}
        storedMethod={null}
        shouldPreselectFirst={false}
        error={errors.method}
        showManageLink={false}
      />

      <Field>
        <FieldLabel htmlFor={ids.reference}>
          Reference{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input
          id={ids.reference}
          name="payment_reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="e-Transfer confirmation or cheque number"
          autoComplete="off"
          enterKeyHint="done"
          className="hover:border-foreground/30"
        />
      </Field>
    </>
  );
}
