"use client";

import { useId } from "react";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription } from "@/components/ui/field";
import SubmitButton from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useInternalNote } from "@/hooks/use-internal-note";

type InternalNoteCardProps = {
  invoiceId: string;
  savedNote: string;
};

const ERROR_TITLE = "Couldn't save the internal note";
// Matches the action's cap (MAX_NOTES_LENGTH in src/lib/actions/invoices.ts).
const MAX_NOTE_LENGTH = 2000;

// The admin-only note, editable at every status and while archived. It never reads the page's
// draft context, so the Issue sheet's unsaved-changes warning doesn't see it.
export default function InternalNoteCard({
  invoiceId,
  savedNote,
}: InternalNoteCardProps): React.ReactNode {
  const { note, error, isPending, changeNote, submit } =
    useInternalNote(savedNote);
  const titleId = useId();
  const captionId = useId();

  return (
    <Card className="gap-4 p-4 text-sm sm:p-5">
      <h2 id={titleId} className="text-lg font-semibold tracking-tight">
        Internal note
      </h2>
      <form
        onSubmit={submit}
        noValidate
        aria-busy={isPending}
        className="space-y-4"
      >
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <Field>
          {/* Above the textarea so the warning reads before typing. */}
          <FieldDescription id={captionId} className="text-sm">
            Admin only, never shown to the client
          </FieldDescription>
          <Textarea
            name="internal_note"
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            aria-labelledby={titleId}
            aria-describedby={captionId}
            autoComplete="off"
            enterKeyHint="enter"
            placeholder="e.g. Paid by e-transfer on Oct 3"
            readOnly={isPending}
            value={note}
            onChange={(event) => changeNote(event.target.value)}
            className="max-h-96 transition-[border-color,box-shadow] duration-fast hover:border-foreground/30"
          />
        </Field>

        {error ? (
          <Alert
            variant="destructive"
            className="animate-in duration-base ease-out-quart fade-in-0 slide-in-from-top-1"
          >
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{ERROR_TITLE}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <SubmitButton
          label="Save"
          pendingLabel="Saving…"
          variant="outline"
          isPending={isPending}
          className="w-full active:scale-[0.98] md:w-auto"
        />
      </form>
    </Card>
  );
}
