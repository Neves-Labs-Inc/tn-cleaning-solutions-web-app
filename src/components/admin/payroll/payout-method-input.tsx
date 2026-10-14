"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { MAX_PAYOUT_METHOD_LENGTH } from "@/lib/employees/employee-form";

// Suggestions only: a Payout method is free text, so any value (or none) is accepted.
const PAYOUT_METHOD_SUGGESTIONS = ["e-Transfer", "Cash"];

type PayoutMethodInputProps = {
  id: string;
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  // The message itself is rendered by the caller (under its own FieldError); this only marks the input.
  error?: string | null;
  describedBy?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ref?: React.Ref<HTMLInputElement>;
};

// The Payout method field: an input with an e-Transfer / Cash datalist. Shared by the employee
// edit form and the Mark paid dialog.
export function PayoutMethodInput({
  id,
  name,
  value,
  defaultValue,
  onChange,
  error,
  describedBy,
  disabled,
  placeholder,
  className,
  ref,
}: PayoutMethodInputProps): React.ReactNode {
  // One datalist per input, so several on one screen (Mark paid rows) never share an id.
  const listId = useId();

  return (
    <>
      <Input
        ref={ref}
        id={id}
        name={name}
        type="text"
        list={listId}
        autoComplete="off"
        enterKeyHint="next"
        maxLength={MAX_PAYOUT_METHOD_LENGTH}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
      />
      <datalist id={listId}>
        {PAYOUT_METHOD_SUGGESTIONS.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </>
  );
}
