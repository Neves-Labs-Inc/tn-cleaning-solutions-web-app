"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateAppointmentEmployeeAdminNotes } from "@/lib/actions/appointments";

// One Cleaner's admin notes on a visit. Saving notes never touches the clocks. The draft is
// seeded once and never reset from props, so a fix's refresh can't wipe unsaved text.

export type AdminNotes = {
  draft: string;
  isDirty: boolean;
  isPending: boolean;
  changeDraft: (value: string) => void;
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
};

const SAVED_MESSAGE = "Notes saved";
const SAVE_FAILED_MESSAGE = "Couldn't save notes. Try again.";

export function useAdminNotes(
  assignmentId: string,
  initialNotes: string,
): AdminNotes {
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [draft, setDraft] = useState(initialNotes);
  const [isPending, startTransition] = useTransition();

  async function save(): Promise<void> {
    const submitted = draft;
    try {
      const result = await updateAppointmentEmployeeAdminNotes(
        assignmentId,
        submitted,
      );
      if (result.success) {
        setSavedNotes(submitted);
        toast.success(SAVED_MESSAGE);
      } else {
        console.warn("updateAppointmentEmployeeAdminNotes refused", {
          assignmentId,
          error: result.error,
        });
        toast.error(SAVE_FAILED_MESSAGE);
      }
    } catch (error) {
      console.error("updateAppointmentEmployeeAdminNotes failed", {
        assignmentId,
        error,
      });
      toast.error(SAVE_FAILED_MESSAGE);
    }
  }

  // Not a form action: React resets a form after its action, which would rewind the draft.
  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending || draft === savedNotes) return;

    startTransition(save);
  }

  return {
    draft,
    isDirty: draft !== savedNotes,
    isPending,
    changeDraft: setDraft,
    submit,
  };
}
