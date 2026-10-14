import { useState } from "react";

export type PeriodSelection = {
  selectedKeys: string[];
  selectedCount: number;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  isSelected: (key: string) => boolean;
  toggle: (key: string) => void;
  selectAll: () => void;
  clear: () => void;
};

// Selection over the period's unpaid run keys. When the selectable keys change (a refresh after an
// action), a key no longer selectable drops out, so a run that was paid elsewhere can't be acted on.
export function usePeriodSelection(selectableKeys: string[]): PeriodSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [seenKey, setSeenKey] = useState(selectableKeys.join(","));

  const key = selectableKeys.join(",");
  let current = selected;
  if (key !== seenKey) {
    // Adjusting state during render (not in an effect) avoids a frame showing stale keys selected.
    current = new Set(selectableKeys.filter((item) => selected.has(item)));
    setSeenKey(key);
    setSelected(current);
  }

  const selectedKeys = selectableKeys.filter((item) => current.has(item));

  function toggle(runKey: string): void {
    const next = new Set(current);
    if (next.has(runKey)) {
      next.delete(runKey);
    } else {
      next.add(runKey);
    }
    setSelected(next);
  }

  return {
    selectedKeys,
    selectedCount: selectedKeys.length,
    isAllSelected:
      selectableKeys.length > 0 &&
      selectedKeys.length === selectableKeys.length,
    isSomeSelected: selectedKeys.length > 0,
    isSelected: (runKey) => current.has(runKey),
    toggle,
    selectAll: () => setSelected(new Set(selectableKeys)),
    clear: () => setSelected(new Set()),
  };
}
