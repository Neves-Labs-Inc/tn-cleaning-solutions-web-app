"use client";

import { AlertCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import SubmitButton from "@/components/ui/submit-button";
import { renamePaymentMethod } from "@/lib/actions/invoices";
import type { PaymentMethod } from "@/lib/invoices/ledger";
import {
  findDuplicateMethod,
  normalizePaymentMethodName,
} from "@/lib/invoices/view";

type PaymentMethodRenameFormProps = {
  method: PaymentMethod;
  methods: PaymentMethod[];
  onClose: () => void;
};

type RenameFailure = { kind: "field"; message: string } | { kind: "alert" };

// Matches the server action's cap on short text fields.
const MAX_NAME_LENGTH = 200;
const BLANK_MESSAGE = "Enter a name.";
const TOO_LONG_MESSAGE = `Use ${MAX_NAME_LENGTH} characters or fewer.`;

function duplicateMessage(existing: PaymentMethod): string {
  return existing.is_hidden
    ? `"${existing.name}" is already a method (hidden). Unhide it instead.`
    : `"${existing.name}" is already a method. Pick a different name.`;
}

// pending only reaches children of the form, so the controls that react to it live here.
function RenameInput({
  onClose,
  ...rest
}: React.ComponentProps<typeof Input> & {
  onClose: () => void;
}): React.ReactNode {
  const { pending } = useFormStatus();

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    // Closing mid-save would hide a failure from the user.
    if (!pending) onClose();
  }

  return <Input {...rest} readOnly={pending} onKeyDown={handleKeyDown} />;
}

function RenameCancel({ onClose }: { onClose: () => void }): React.ReactNode {
  const { pending } = useFormStatus();

  return (
    <Button
      type="button"
      variant="ghost"
      className="active:scale-[0.98]"
      disabled={pending}
      onClick={onClose}
    >
      Cancel
    </Button>
  );
}

export default function PaymentMethodRenameForm({
  method,
  methods,
  onClose,
}: PaymentMethodRenameFormProps): React.ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<RenameFailure | null>(null);
  // Controlled: React resets an uncontrolled field after a form action, losing the typed text.
  const [value, setValue] = useState(method.name);
  const inputId = useId();
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const fieldMessage = failure?.kind === "field" ? failure.message : null;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function refuseField(message: string): void {
    setFailure({ kind: "field", message });
    inputRef.current?.focus();
  }

  async function saveName(name: string, formData: FormData): Promise<void> {
    let result: Awaited<ReturnType<typeof renamePaymentMethod>> | null = null;
    try {
      result = await renamePaymentMethod(null, formData);
    } catch (error) {
      // A dropped connection rejects the action; it shows the generic alert below.
      console.error("renamePaymentMethod failed:", error);
    }

    if (result?.success) {
      toast.success(
        `Renamed to "${name}". Past payments still show "${method.name}".`,
      );
      onClose();
    } else if (result?.code === "method_name_taken") {
      // Another tab won the race; quote the stored name when it is in this list.
      const existing = findDuplicateMethod(name, methods, method.id);
      refuseField(
        existing
          ? duplicateMessage(existing)
          : `"${name}" is already a method. Pick a different name.`,
      );
    } else if (result?.code === "method_name_required") {
      refuseField(BLANK_MESSAGE);
    } else {
      setFailure({ kind: "alert" });
    }
  }

  async function handleSubmit(formData: FormData): Promise<void> {
    const name = normalizePaymentMethodName(String(formData.get("name") ?? ""));
    const duplicate = findDuplicateMethod(name, methods, method.id);

    if (!name) {
      refuseField(BLANK_MESSAGE);
    } else if (name.length > MAX_NAME_LENGTH) {
      refuseField(TOO_LONG_MESSAGE);
    } else if (name === method.name) {
      onClose();
    } else if (duplicate) {
      refuseField(duplicateMessage(duplicate));
    } else {
      formData.set("name", name);
      await saveName(name, formData);
    }
  }

  // The form is the grid; Field is display:contents so its invalid colour stops at its own children.
  return (
    <form
      action={handleSubmit}
      className="grid gap-3 animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart md:grid-cols-[1fr_auto] md:gap-x-2"
    >
      <input type="hidden" name="payment_method_id" value={method.id} />
      <Field
        data-invalid={fieldMessage ? true : undefined}
        className="contents"
      >
        <FieldLabel htmlFor={inputId} className="md:col-span-2">
          Name
        </FieldLabel>
        <RenameInput
          ref={inputRef}
          id={inputId}
          name="name"
          type="text"
          value={value}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={fieldMessage ? true : undefined}
          aria-describedby={
            fieldMessage ? `${descriptionId} ${errorId}` : descriptionId
          }
          onChange={(event) => {
            setValue(event.target.value);
            setFailure(null);
          }}
          onClose={onClose}
          className="transition-[border-color,box-shadow] duration-fast hover:border-foreground/30"
        />
        <div className="space-y-1 md:col-span-2 md:row-start-3">
          <FieldDescription id={descriptionId}>
            Past payments keep the name they were recorded with.
          </FieldDescription>
          {fieldMessage ? (
            <FieldError
              id={errorId}
              className="animate-in fade-in-0 duration-fast"
            >
              {fieldMessage}
            </FieldError>
          ) : null}
        </div>
      </Field>
      {failure?.kind === "alert" ? (
        <Alert
          variant="destructive"
          className="animate-in fade-in-0 duration-fast md:col-span-2 md:row-start-4"
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{`Couldn't rename "${method.name}"`}</AlertTitle>
          <AlertDescription>Try again. Nothing was changed.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-2 md:col-start-2 md:row-start-2 md:flex">
        <RenameCancel onClose={onClose} />
        <SubmitButton
          className="active:scale-[0.98]"
          label="Save"
          pendingLabel="Saving…"
        />
      </div>
    </form>
  );
}
