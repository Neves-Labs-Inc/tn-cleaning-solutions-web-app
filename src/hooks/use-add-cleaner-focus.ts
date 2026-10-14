import { useCallback, useEffect, useRef, useState } from "react";

// Marks the Add Cleaner trigger(s); the toolbar and the empty state each render one.
const ADD_CLEANER_TRIGGER_ATTRIBUTE = "data-add-cleaner-trigger";

function findVisibleTrigger(): HTMLElement | null {
  const triggers = document.querySelectorAll<HTMLElement>(
    `[${ADD_CLEANER_TRIGGER_ATTRIBUTE}]`,
  );
  return [...triggers].find((item) => item.getClientRects().length > 0) ?? null;
}

// After Remove from period the run's row is gone, and so is the focused button. This moves focus
// to Add Cleaner once the refreshed list (without that run) renders: the toolbar's trigger, or
// the empty state's when the last run went. Call it with the run list as it was when the action
// succeeded; `runKeys` is the current list.
export function useAddCleanerFocus(runKeys: string[]): () => void {
  // The run list when focus was requested; null when nothing is pending.
  const requestedAtRef = useRef<string | null>(null);
  const [request, setRequest] = useState(0);
  const runKeysText = runKeys.join(",");

  useEffect(() => {
    const requestedAt = requestedAtRef.current;
    // Wait for the refresh: until the list changes, the removed row is still there.
    if (requestedAt === null || requestedAt === runKeysText) return;

    requestedAtRef.current = null;
    findVisibleTrigger()?.focus();
  }, [request, runKeysText]);

  return useCallback(() => {
    requestedAtRef.current = runKeysText;
    setRequest((current) => current + 1);
  }, [runKeysText]);
}
