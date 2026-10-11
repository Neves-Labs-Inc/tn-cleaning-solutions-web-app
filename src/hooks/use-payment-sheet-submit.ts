"use client";

import { useState, useTransition } from "react";

import { CONNECTION_ERROR_MESSAGE } from "@/components/invoices/invoice-detail-context";
import type { InvoiceActionResult } from "@/lib/actions/invoices";

// The submit flow of a payment sheet (Mark paid, Record payment): check the form, post it, then
// show each problem under its field or in the form alert. The sheet stays open on any failure.
// Submitted through onSubmit, not a form action: React resets a form after an action, and a reset
// moves a controlled <select> to its first option while its state (and what posts) stays put.

// Field key → message, in the order the fields appear, so the first one is focused.
export type SheetFieldErrors = Record<string, string>;

export type PaymentSheetSubmit = {
  fieldErrors: SheetFieldErrors;
  formError: string | null;
  isPending: boolean;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

type PaymentSheetSubmitOptions<T> = {
  action: (previous: null, formData: FormData) => Promise<InvoiceActionResult<T>>;
  // Client-side checks; an empty object lets the form post.
  validate: (formData: FormData) => SheetFieldErrors;
  focusField: (key: string) => void;
  onSuccess: (data: T) => void;
  // The server refused: the page behind the sheet may be stale.
  onRefusal: () => void;
};

const FIELD_CODES: Record<string, string> = {
  paid_date_future: "paidDate",
  method_required: "method",
};

export default function usePaymentSheetSubmit<T>({
  action,
  validate,
  focusField,
  onSuccess,
  onRefusal,
}: PaymentSheetSubmitOptions<T>): PaymentSheetSubmit {
  const [fieldErrors, setFieldErrors] = useState<SheetFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function showFieldErrors(errors: SheetFieldErrors): void {
    setFieldErrors(errors);
    const [first] = Object.keys(errors);
    if (first) focusField(first);
  }

  async function submit(formData: FormData): Promise<void> {
    setFormError(null);
    const errors = validate(formData);
    showFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const result = await action(null, formData);
      if (result.success) {
        onSuccess(result.data);
        return;
      }

      onRefusal();
      const field = FIELD_CODES[result.code];
      if (field) {
        showFieldErrors({ [field]: result.error });
      } else {
        setFormError(result.error);
      }
    } catch (thrown) {
      console.error("Payment sheet action failed:", thrown);
      setFormError(CONNECTION_ERROR_MESSAGE);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => submit(formData));
  }

  return { fieldErrors, formError, isPending, handleSubmit };
}
