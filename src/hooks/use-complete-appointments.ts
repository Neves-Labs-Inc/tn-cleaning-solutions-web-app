"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useInvalidateAppointments } from "@/hooks/use-invalidate-appointments";
import { markAppointmentsComplete } from "@/lib/actions/appointments";
import type { NeedsCompletionAppointment } from "@/lib/appointments/needs-completion";
import {
  describeCompletion,
  getSelectAll,
  toggleSelectAll,
  type SelectAll,
} from "@/lib/appointments/needs-completion-view";

// Needs completion's selection, its confirm dialog and the bulk Mark complete behind it.

export type CompleteAppointments = {
  selectedIds: string[];
  // The checked rows still on the list, so a row that left it after a refresh drops out.
  selected: NeedsCompletionAppointment[];
  selectAll: SelectAll;
  isDialogOpen: boolean;
  // How many the open (or closing) dialog asks about; kept while it closes after the selection
  // has cleared, so its title doesn't change mid-animation.
  dialogCount: number;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
  openDialog: () => void;
  setDialogOpen: (isOpen: boolean) => void;
  confirm: () => Promise<void>;
};

const FAILED_MESSAGE = "Couldn't mark these complete. Try again.";

type DialogState = { isOpen: boolean; count: number };

export function useCompleteAppointments(
  appointments: NeedsCompletionAppointment[],
): CompleteAppointments {
  const router = useRouter();
  const invalidateAppointments = useInvalidateAppointments();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>({ isOpen: false, count: 0 });

  // `appointments` can narrow under a filter; a hidden row drops out for good, so a bulk action
  // never touches it and widening the filter shows it unchecked.
  const visibleSelectedIds = selectedIds.filter((id) =>
    appointments.some((appointment) => appointment.id === id),
  );
  if (visibleSelectedIds.length !== selectedIds.length) {
    setSelectedIds(visibleSelectedIds);
  }

  const selected = appointments.filter((appointment) =>
    selectedIds.includes(appointment.id),
  );
  const ids = appointments.map((appointment) => appointment.id);

  function setDialogOpen(isOpen: boolean): void {
    setDialog((current) => ({ ...current, isOpen }));
  }

  function toggle(id: string): void {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );
  }

  async function confirm(): Promise<void> {
    try {
      const result = await markAppointmentsComplete(
        selected.map((appointment) => appointment.id),
      );

      if (result.success) {
        // Even a partial run completed some rows.
        void invalidateAppointments();
        const outcome = describeCompletion({
          completed: result.completedCount,
          skipped: result.skippedCount,
          failed: result.failedIds.length,
        });
        // The ones a dropped connection never reached stay selected, so a retry is one tap.
        setSelectedIds(result.failedIds);
        if (outcome.isSuccess) {
          toast.success(outcome.message);
        } else {
          toast.error(outcome.message);
          router.refresh();
        }
      } else {
        // The selection stays, so a retry is one tap.
        toast.error(FAILED_MESSAGE);
      }
    } catch (thrown) {
      console.error("Bulk Mark complete failed:", thrown);
      toast.error(FAILED_MESSAGE);
    }

    setDialogOpen(false);
  }

  return {
    selectedIds,
    selected,
    selectAll: getSelectAll(selected.length, appointments.length),
    isDialogOpen: dialog.isOpen,
    dialogCount: dialog.count,
    toggle,
    toggleAll: () => setSelectedIds(toggleSelectAll(ids, selectedIds)),
    clear: () => setSelectedIds([]),
    openDialog: () => setDialog({ isOpen: true, count: selected.length }),
    setDialogOpen,
    confirm,
  };
}
