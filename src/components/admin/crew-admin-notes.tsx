"use client";

import { PRESS_FEEDBACK } from "@/components/admin/time-sheets/clock-form-footer";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import SubmitButton from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useAdminNotes } from "@/hooks/use-admin-notes";
import { cn } from "@/lib/utils";

type CrewAdminNotesProps = {
  assignmentId: string;
  initialNotes: string;
};

export default function CrewAdminNotes({
  assignmentId,
  initialNotes,
}: CrewAdminNotesProps): React.ReactNode {
  const notes = useAdminNotes(assignmentId, initialNotes);
  const textareaId = `admin-notes-${assignmentId}`;
  const descriptionId = `${textareaId}-description`;

  return (
    <form onSubmit={notes.submit} className="space-y-3 border-t pt-3">
      <Field>
        <FieldLabel htmlFor={textareaId}>Admin notes</FieldLabel>
        {/* Three lines tall (plus py-2.5): the primitive sizes to content and ignores rows. */}
        <Textarea
          id={textareaId}
          value={notes.draft}
          onChange={(event) => notes.changeDraft(event.target.value)}
          aria-describedby={descriptionId}
          className="min-h-[calc(3lh+1.25rem)] transition-[border-color,box-shadow] duration-fast md:hover:border-foreground/30"
        />
        <FieldDescription id={descriptionId}>
          Only admins see these. Saving notes doesn&apos;t change clock times.
        </FieldDescription>
      </Field>
      <div className="flex sm:justify-end">
        {/* Disabled while clean: there is nothing to save, not an error. */}
        <SubmitButton
          label="Save notes"
          pendingLabel="Saving…"
          variant="outline"
          isPending={notes.isPending}
          disabled={!notes.isDirty}
          className={cn(
            PRESS_FEEDBACK,
            "w-full active:bg-muted sm:w-auto md:hover:bg-muted",
          )}
        />
      </div>
    </form>
  );
}
