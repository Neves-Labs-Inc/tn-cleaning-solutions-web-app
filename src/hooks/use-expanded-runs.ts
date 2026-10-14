import { useCallback, useEffect, useRef, useState } from "react";

export type ExpandOptions = { shouldOpenAdjustmentForm?: boolean };

export type ExpandedRuns = {
  expandedKeys: ReadonlySet<string>;
  // Runs whose Adjustment form opens when their ledger mounts (after Add Cleaner).
  adjustmentFormKeys: ReadonlySet<string>;
  toggle: (key: string) => void;
  // Opens the row, then scrolls it into view once it renders: it may only exist after a refresh.
  expand: (key: string, options?: ExpandOptions) => void;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// The table and the cards both render every row; only the one for this width is laid out.
function findVisibleRow(key: string): HTMLElement | null {
  const rows = document.querySelectorAll<HTMLElement>(
    `[data-run-key="${CSS.escape(key)}"]`,
  );
  return [...rows].find((row) => row.getClientRects().length > 0) ?? null;
}

// Which run ledgers are open on the period page. Any number can be open at once. `runKeys` is
// the current list, so a row that appears after a refresh is scrolled to as soon as it renders.
export function useExpandedRuns(runKeys: string[]): ExpandedRuns {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [adjustmentFormKeys, setAdjustmentFormKeys] = useState<
    ReadonlySet<string>
  >(() => new Set());
  // The row waiting to be scrolled to; a ref, since clearing it must not re-render.
  const scrollKeyRef = useRef<string | null>(null);
  // Bumped by expand so the effect runs even when the row is already rendered.
  const [scrollRequest, setScrollRequest] = useState(0);
  const runKeysText = runKeys.join(",");

  useEffect(() => {
    const key = scrollKeyRef.current;
    if (key === null) return;

    const row = findVisibleRow(key);
    if (row !== null) {
      const isReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
      row.scrollIntoView({
        block: "start",
        behavior: isReducedMotion ? "auto" : "smooth",
      });
      scrollKeyRef.current = null;
    }
  }, [scrollRequest, runKeysText]);

  function toggle(key: string): void {
    const isClosing = expandedKeys.has(key);
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (isClosing) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    if (isClosing) {
      setAdjustmentFormKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  // Stable, so the period's action context doesn't change identity every render.
  const expand = useCallback(
    (key: string, options: ExpandOptions = {}): void => {
      setExpandedKeys((current) => new Set(current).add(key));
      if (options.shouldOpenAdjustmentForm) {
        setAdjustmentFormKeys((current) => new Set(current).add(key));
      }
      scrollKeyRef.current = key;
      setScrollRequest((current) => current + 1);
    },
    [],
  );

  return { expandedKeys, adjustmentFormKeys, toggle, expand };
}
