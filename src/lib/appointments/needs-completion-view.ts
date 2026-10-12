// The Needs completion view's selection and copy. Pure, so node:test and the client view can
// both load it.

export type SelectAllState = "none" | "some" | "all";

export type SelectAll = { state: SelectAllState; label: string };

export type CompletionCounts = {
  completed: number;
  skipped: number;
  failed: number;
};

export type CompletionOutcome = { isSuccess: boolean; message: string };

const ALL_SKIPPED_MESSAGE =
  "Nothing was marked complete. They all changed. Refresh to see them.";

// The Select all row: its checkbox state and the label that doubles as its aria-label.
export function getSelectAll(selectedCount: number, total: number): SelectAll {
  let state: SelectAllState = "some";
  if (selectedCount === 0) state = "none";
  if (selectedCount === total) state = "all";

  const label =
    state === "none" ? `Select all ${total}` : `${selectedCount} of ${total} selected`;
  return { state, label };
}

// Clears when every row is checked; otherwise checks them all.
export function toggleSelectAll(ids: string[], selectedIds: string[]): string[] {
  const isAllSelected = ids.every((id) => selectedIds.includes(id));
  return isAllSelected ? [] : [...ids];
}

export function getCompletionConfirmTitle(count: number): string {
  const noun = count === 1 ? "appointment" : "appointments";
  return `Mark ${count} ${noun} complete?`;
}

// The toast after a bulk Mark complete. Nothing completed, or some unreached, reads as a failure.
export function describeCompletion({
  completed,
  skipped,
  failed,
}: CompletionCounts): CompletionOutcome {
  if (completed === 0) return { isSuccess: false, message: ALL_SKIPPED_MESSAGE };

  const skippedNote =
    skipped === 1
      ? " 1 skipped because it changed. Refresh to see it."
      : ` ${skipped} skipped because they changed. Refresh to see them.`;
  const failedNote = ` ${failed} couldn't be marked, still selected. Try again.`;
  const message = `Marked ${completed} complete.${skipped > 0 ? skippedNote : ""}${failed > 0 ? failedNote : ""}`;
  return { isSuccess: failed === 0, message };
}
