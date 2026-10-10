"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { correctSessionClocks } from "@/lib/actions/time-sheets";
import {
  draftToInstants,
  prefillClockDraft,
  validateClockDraft,
  type ClockDraft,
  type ClockDraftView,
  type DraftField,
} from "@/lib/time-sheets/clock-draft";
import type { FixAction, FlagKind } from "@/lib/time-sheets/session-view";

// One Clock correction form: draft, client checks, the save, and where focus goes. Both layouts
// (drill-down row and card) and the appointment page share it.

export type ClockFixView = ClockDraftView & {
  id: string;
  scheduledWindow: string;
  fixAction: FixAction | null;
  flags: FlagKind[];
};

export type ClockField = "clockIn" | "clockOut";
export type ClockCorrectionErrors = {
  clockIn?: string;
  clockOut?: string;
  form?: string;
};

export type ClockCorrection = {
  mode: FixAction;
  ids: Record<ClockField | "reason" | "alert", string>;
  draft: ClockDraft;
  reason: string;
  errors: ClockCorrectionErrors;
  isPending: boolean;
  // Edit mode with both times emptied: saving clears the session's clocks.
  isCleared: boolean;
  prefillHint: string | null;
  clockOutHint: string | null;
  submitLabel: string;
  changeClock: (field: ClockField, part: keyof DraftField, value: string) => void;
  changeReason: (value: string) => void;
  clear: () => void;
  cancel: () => void;
  submit: (event: React.FormEvent<HTMLFormElement>) => void;
  handleKeyDown: (event: React.KeyboardEvent) => void;
};

export const FIX_LABELS: Record<FixAction, string> = {
  edit: "Edit",
  close: "Close shift",
  add: "Add session",
};

const SUBMIT_LABELS: Record<FixAction, string> = {
  edit: "Save times",
  close: "Close shift",
  add: "Add session",
};

const SUCCESS_MESSAGES: Record<FixAction, string> = {
  edit: "Times saved",
  close: "Shift closed",
  add: "Session added",
};

const CLEARED_MESSAGE = "Clocks cleared";
const NETWORK_ERROR = "Couldn't save. Check your connection and try again.";
const OPTIONAL_HINT = "Optional";

function getPrefillHint(view: ClockFixView, mode: FixAction): string | null {
  if (mode === "edit") return null;

  return `Prefilled from the schedule (${view.scheduledWindow})`;
}

// In add mode a clock-out is optional until the server would demand one (grace end).
function getClockOutHint(view: ClockFixView, mode: FixAction, now: Date): string | null {
  const isOptional = mode === "add" && now.getTime() < Date.parse(view.graceEnd);
  return isOptional ? OPTIONAL_HINT : null;
}

export function useClockCorrection(
  view: ClockFixView,
  mode: FixAction,
  onClose: () => void,
): ClockCorrection {
  const router = useRouter();
  const baseId = useId();
  // Read once on open: the prefill and hints describe the moment the admin asked to fix.
  const [openedAt] = useState(() => new Date());
  const [draft, setDraft] = useState(() => prefillClockDraft(view, mode, openedAt));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<ClockCorrectionErrors>({});
  const [isPending, startTransition] = useTransition();
  const shouldFocusError = useRef(false);
  // The admin can open another panel mid-save, unmounting this form before the answer lands.
  const isMounted = useRef(true);
  const ids = {
    clockIn: `${baseId}-clock-in`,
    clockOut: `${baseId}-clock-out`,
    reason: `${baseId}-reason`,
    alert: `${baseId}-alert`,
  };

  const isCleared = mode === "edit" && draft.clockIn.time === "" && draft.clockOut.time === "";

  // The admin just asked to fix this session, so the first clock is the next step.
  useEffect(() => {
    document.getElementById(ids.clockIn)?.focus();
  }, [ids.clockIn]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Runs after the errors render, so the alert exists before it takes focus.
  useEffect(() => {
    if (!shouldFocusError.current) return;

    shouldFocusError.current = false;
    let targetId: string | null = null;
    if (errors.clockIn) {
      targetId = ids.clockIn;
    } else if (errors.clockOut) {
      targetId = ids.clockOut;
    } else if (errors.form) {
      targetId = ids.alert;
    }
    if (targetId) document.getElementById(targetId)?.focus();
  }, [errors, ids.clockIn, ids.clockOut, ids.alert]);

  // A refusal for a form that is gone becomes a toast, so the admin still learns nothing saved.
  function showErrors(next: ClockCorrectionErrors): void {
    if (!isMounted.current) {
      toast.error(next.clockIn ?? next.clockOut ?? next.form ?? NETWORK_ERROR);
      return;
    }

    shouldFocusError.current = true;
    setErrors(next);
  }

  function changeClock(field: ClockField, part: keyof DraftField, value: string): void {
    setDraft((current) => ({
      ...current,
      [field]: { ...current[field], [part]: value },
    }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function clear(): void {
    setDraft((current) => ({
      clockIn: { ...current.clockIn, time: "" },
      clockOut: { ...current.clockOut, time: "" },
    }));
    setErrors({});
  }

  function cancel(): void {
    if (isPending) return;

    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key !== "Escape") return;

    event.preventDefault();
    cancel();
  }

  async function save(): Promise<void> {
    const instants = draftToInstants(draft, view);
    // The server writes nothing for unchanged clocks either, so skip the round trip.
    const isUnchanged = instants.clockIn === view.clockIn && instants.clockOut === view.clockOut;
    if (isUnchanged) {
      onClose();
      return;
    }

    try {
      const result = await correctSessionClocks({
        assignmentId: view.id,
        ...instants,
        reason: reason.trim() || null,
      });
      if (result.ok) {
        const isClear = instants.clockIn === null && instants.clockOut === null;
        toast.success(isClear ? CLEARED_MESSAGE : SUCCESS_MESSAGES[mode]);
        router.refresh();
        onClose();
      } else {
        // Note errors belong to acknowledgements; anything off-field shows above the buttons.
        const field = result.field === "clockIn" || result.field === "clockOut" ? result.field : "form";
        showErrors({ [field]: result.message });
      }
    } catch (error) {
      console.error("correctSessionClocks failed", { assignmentId: view.id, error });
      showErrors({ form: NETWORK_ERROR });
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending) return;

    const draftErrors = validateClockDraft(draft, mode, view, new Date());
    if (draftErrors.clockIn || draftErrors.clockOut) {
      showErrors(draftErrors);
      return;
    }

    setErrors({});
    startTransition(save);
  }

  return {
    mode,
    ids,
    draft,
    reason,
    errors,
    isPending,
    isCleared,
    prefillHint: getPrefillHint(view, mode),
    clockOutHint: getClockOutHint(view, mode, openedAt),
    submitLabel: SUBMIT_LABELS[mode],
    changeClock,
    changeReason: setReason,
    clear,
    cancel,
    submit,
    handleKeyDown,
  };
}
