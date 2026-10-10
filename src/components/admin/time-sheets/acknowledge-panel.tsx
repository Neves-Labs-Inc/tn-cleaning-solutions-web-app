"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
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
import SubmitButton from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { acknowledgeOddDuration } from "@/lib/actions/time-sheets";
import type { SessionRowView } from "@/lib/time-sheets/drilldown-days";

type AcknowledgePanelProps = {
  view: SessionRowView;
  // Closes after a successful acknowledgement.
  onClose: () => void;
  // Closes on Cancel or Escape; the caller returns focus to the Acknowledge button.
  onCancel: () => void;
};

type Failure =
  | { kind: "field"; message: string }
  | { kind: "alert"; message: string };

// Matches the server action's cap on short text.
const MAX_NOTE_LENGTH = 2000;
const EMPTY_NOTE_MESSAGE = "Add a note saying why this length is fine";
const NETWORK_MESSAGE = "Check your connection and try again. Nothing was saved.";

// pending only reaches children of the form, so the controls that react to it live here.
function NoteTextarea({
  onCancel,
  ...rest
}: React.ComponentProps<typeof Textarea> & {
  onCancel: () => void;
}): React.ReactNode {
  const { pending } = useFormStatus();

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    // Closing mid-save would hide a failure from the user.
    if (!pending) onCancel();
  }

  return <Textarea {...rest} readOnly={pending} onKeyDown={handleKeyDown} />;
}

function CancelButton({ onCancel }: { onCancel: () => void }): React.ReactNode {
  const { pending } = useFormStatus();

  return (
    <Button
      type="button"
      variant="ghost"
      className="active:scale-[0.98]"
      disabled={pending}
      onClick={onCancel}
    >
      Cancel
    </Button>
  );
}

export default function AcknowledgePanel({
  view,
  onClose,
  onCancel,
}: AcknowledgePanelProps): React.ReactNode {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The admin can open another session's panel mid-save, unmounting this one.
  const isMounted = useRef(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  // Controlled: React resets an uncontrolled field after a form action, losing the typed note.
  const [note, setNote] = useState("");
  const fieldId = useId();
  const descriptionId = `${fieldId}-description`;
  const errorId = `${fieldId}-error`;
  const fieldMessage = failure?.kind === "field" ? failure.message : null;

  useEffect(() => {
    isMounted.current = true;
    textareaRef.current?.focus();
    return () => {
      isMounted.current = false;
    };
  }, []);

  function refuseNote(message: string): void {
    setFailure({ kind: "field", message });
    textareaRef.current?.focus();
  }

  async function submitNote(trimmedNote: string): Promise<void> {
    let result: Awaited<ReturnType<typeof acknowledgeOddDuration>> | null = null;
    try {
      result = await acknowledgeOddDuration({
        assignmentId: view.id,
        expectedClockIn: view.clockIn,
        expectedClockOut: view.clockOut,
        note: trimmedNote,
      });
    } catch (error) {
      // A dropped connection rejects the action; it shows the network alert below.
      console.error("acknowledgeOddDuration failed:", error);
    }

    if (!result?.ok && !isMounted.current) {
      toast.error(
        result ? result.message : NETWORK_MESSAGE,
      );
    } else if (result?.ok) {
      toast.success("Acknowledged");
      onClose();
      router.refresh();
    } else if (result && result.field === "note") {
      refuseNote(result.message);
    } else {
      setFailure({
        kind: "alert",
        message: result ? result.message : NETWORK_MESSAGE,
      });
    }
  }

  async function handleSubmit(): Promise<void> {
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      refuseNote(EMPTY_NOTE_MESSAGE);
      return;
    }
    await submitNote(trimmedNote);
  }

  return (
    <form
      action={handleSubmit}
      noValidate
      // Synchronous, so a stale alert goes as soon as a retry starts.
      onSubmit={() => setFailure(null)}
      className="grid animate-in gap-3 duration-base ease-out-quart fade-in-0 slide-in-from-top-1"
    >
      <Field data-invalid={fieldMessage ? true : undefined}>
        <FieldLabel htmlFor={fieldId}>Note</FieldLabel>
        <NoteTextarea
          ref={textareaRef}
          id={fieldId}
          name="note"
          rows={2}
          maxLength={MAX_NOTE_LENGTH}
          value={note}
          placeholder="e.g. Client added the oven on site"
          autoComplete="off"
          enterKeyHint="done"
          aria-required="true"
          aria-invalid={fieldMessage ? true : undefined}
          aria-describedby={
            fieldMessage ? `${descriptionId} ${errorId}` : descriptionId
          }
          onChange={(event) => {
            setNote(event.target.value);
            setFailure(null);
          }}
          onCancel={onCancel}
          className="min-h-16 transition-[border-color,box-shadow] duration-fast hover:border-foreground/30"
        />
        {fieldMessage ? (
          <FieldError
            id={errorId}
            className="animate-in duration-fast fade-in-0"
          >
            {fieldMessage}
          </FieldError>
        ) : null}
        <FieldDescription id={descriptionId}>
          Lapses if the clock times change later.
        </FieldDescription>
      </Field>
      {failure?.kind === "alert" ? (
        <Alert
          variant="destructive"
          className="animate-in duration-fast fade-in-0"
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Couldn&apos;t acknowledge</AlertTitle>
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-2 md:flex">
        <CancelButton onCancel={onCancel} />
        <SubmitButton
          className="active:scale-[0.98]"
          label="Acknowledge"
          pendingLabel="Acknowledging…"
        />
      </div>
    </form>
  );
}
