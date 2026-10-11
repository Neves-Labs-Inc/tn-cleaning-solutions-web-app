"use client";

import Link from "next/link";
import { useId, useImperativeHandle, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import type { PaymentMethod } from "@/lib/invoices/ledger";
import {
  findDuplicateMethod,
  normalizePaymentMethodName,
} from "@/lib/invoices/view";

export type PaymentMethodFieldHandle = { focus: () => void };

type PaymentMethodFieldProps = {
  // Every method, hidden ones included: a typed name can match a hidden method.
  methods: PaymentMethod[];
  // The method a stored payment was made with ("" when it had none); null for a new payment.
  storedMethod: string | null;
  // A new payment starts on the first visible method, or on "Choose a method" when false.
  shouldPreselectFirst: boolean;
  error: string | null;
  // Leaving for the methods page drops the sheet, so a sheet that must not lose its input hides it.
  showManageLink: boolean;
  ref?: React.Ref<PaymentMethodFieldHandle>;
};

// The "Other…" option's value. A stored method with this exact name would be shadowed; none is expected.
const OTHER = "__other__";
const MANAGE_METHODS_PATH = "/solutions/invoices/payment-methods";

// The picker lists the visible methods in sort_order. When editing, a stored method that is now
// hidden or renamed leads the list, so saving the edit doesn't change it.
function methodOptions(
  visible: PaymentMethod[],
  storedMethod: string | null,
): string[] {
  const names = visible.map((method) => method.name);
  const isStoredMissing =
    storedMethod !== null && storedMethod !== "" && !names.includes(storedMethod);
  return isStoredMissing ? [storedMethod, ...names] : names;
}

function initialChoice(
  options: string[],
  storedMethod: string | null,
  shouldPreselectFirst: boolean,
): string {
  if (storedMethod !== null) return storedMethod;
  if (!shouldPreselectFirst) return "";
  return options[0] || OTHER;
}

// The Method select, its "Other…" name input and their hints. Posts the chosen name as
// payment_method, normalised the way SQL saves it.
export default function PaymentMethodField({
  methods,
  storedMethod,
  shouldPreselectFirst,
  error,
  showManageLink,
  ref,
}: PaymentMethodFieldProps): React.ReactNode {
  const ids = { select: useId(), other: useId(), error: useId() };
  const selectRef = useRef<HTMLSelectElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  const visible = methods.filter((method) => !method.is_hidden);
  const options = methodOptions(visible, storedMethod);

  const [choice, setChoice] = useState(() =>
    initialChoice(options, storedMethod, shouldPreselectFirst),
  );
  const [otherName, setOtherName] = useState("");

  const isOther = choice === OTHER;
  const method = isOther ? normalizePaymentMethodName(otherName) : choice;
  const duplicate =
    isOther && method ? findDuplicateMethod(method, visible, "") : null;
  // SQL reuses a hidden method typed by name, and it stays hidden.
  const hiddenMatch =
    isOther && method && !duplicate
      ? findDuplicateMethod(method, methods, "")
      : null;
  const selectError = error && !isOther ? error : null;
  const otherError = error && isOther ? error : null;

  useImperativeHandle(ref, () => ({
    focus: () => (isOther ? otherRef.current : selectRef.current)?.focus(),
  }));

  function handleChoiceChange(next: string): void {
    setChoice(next);
    if (next === OTHER) {
      // After the field mounts; autoFocus would also fire when "Other…" is the only option.
      requestAnimationFrame(() => otherRef.current?.focus());
    }
  }

  return (
    <>
      <input type="hidden" name="payment_method" value={method} />

      <Field data-invalid={selectError ? true : undefined}>
        <FieldLabel htmlFor={ids.select}>Method</FieldLabel>
        <NativeSelect
          ref={selectRef}
          id={ids.select}
          value={choice}
          onChange={(event) => handleChoiceChange(event.target.value)}
          className="w-full"
          aria-invalid={selectError ? true : undefined}
          aria-describedby={selectError ? ids.error : undefined}
        >
          {choice === "" ? (
            <NativeSelectOption value="" disabled>
              Choose a method
            </NativeSelectOption>
          ) : null}
          {options.map((name) => (
            <NativeSelectOption key={name} value={name}>
              {name}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={OTHER}>Other…</NativeSelectOption>
        </NativeSelect>
        {selectError ? (
          <FieldError id={ids.error}>{selectError}</FieldError>
        ) : null}
        {showManageLink ? (
          <Link
            href={MANAGE_METHODS_PATH}
            className="inline-flex min-h-11 w-fit! cursor-pointer self-start items-center rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none transition-opacity duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 active:opacity-70 md:min-h-0 md:hover:underline"
          >
            Manage methods
          </Link>
        ) : null}
      </Field>

      {isOther ? (
        <Field
          data-invalid={otherError ? true : undefined}
          className="animate-in fade-in-0 slide-in-from-top-1 duration-base"
        >
          <FieldLabel htmlFor={ids.other}>Method name</FieldLabel>
          <Input
            ref={otherRef}
            id={ids.other}
            value={otherName}
            onChange={(event) => setOtherName(event.target.value)}
            autoComplete="off"
            enterKeyHint="next"
            placeholder="e.g. Cash"
            aria-invalid={otherError ? true : undefined}
            aria-describedby={otherError ? ids.error : undefined}
            className="hover:border-foreground/30"
          />
          {otherError ? (
            <FieldError id={ids.error}>{otherError}</FieldError>
          ) : null}
          {duplicate ? (
            <FieldDescription className="flex flex-wrap items-center gap-x-1">
              {duplicate.name} is already in the list.
              <Button
                type="button"
                variant="link"
                className="h-auto min-h-11 px-0 md:min-h-0"
                onClick={() => setChoice(duplicate.name)}
              >
                Use {duplicate.name}
              </Button>
            </FieldDescription>
          ) : hiddenMatch ? (
            <FieldDescription>
              {hiddenMatch.name} is a hidden method. The payment is recorded
              under it and it stays hidden.
            </FieldDescription>
          ) : (
            <FieldDescription>
              It&apos;s added to the list for next time.
            </FieldDescription>
          )}
        </Field>
      ) : null}
    </>
  );
}
