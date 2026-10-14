"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CONNECTION_ERROR_MESSAGE } from "@/components/invoices/invoice-detail-context";
import { setInternalNote } from "@/lib/actions/invoices";

// An invoice's Internal note. Kept apart from the draft's details context, so it never counts as
// an unsaved draft change. Seeded once and never reset from props, so another action's refresh
// can't wipe what the admin is typing.

export type InternalNote = {
  note: string;
  error: string | null;
  isPending: boolean;
  changeNote: (value: string) => void;
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
};

const SAVED_MESSAGE = "Internal note saved";

export function useInternalNote(savedNote: string): InternalNote {
  const [note, setNote] = useState(savedNote);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeNote(value: string): void {
    setNote(value);
    setError(null);
  }

  async function save(formData: FormData): Promise<void> {
    try {
      const result = await setInternalNote(null, formData);
      if (result.success) {
        // Shows what was stored: the action trims it, and blank clears it.
        setNote(String(formData.get("internal_note") ?? "").trim());
        toast.success(SAVED_MESSAGE);
      } else {
        setError(result.error);
      }
    } catch (thrown) {
      console.error("Save internal note failed:", thrown);
      setError(CONNECTION_ERROR_MESSAGE);
    }
  }

  // Not a form action: React resets a form after its action, which would rewind the typed note.
  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(() => save(formData));
  }

  return { note, error, isPending, changeNote, submit };
}
