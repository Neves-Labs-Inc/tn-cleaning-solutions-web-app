import { useState } from 'react'

import { BULK_ISSUE_LIMIT } from '@/lib/invoices/view'

export type DraftSelection = {
  selectedIds: string[]
  selectedCount: number
  isAllSelected: boolean
  isSomeSelected: boolean
  // True when more drafts are visible than one batch can hold.
  isCapped: boolean
  isSelected: (id: string) => boolean
  toggle: (id: string) => void
  selectAll: () => void
  clear: () => void
}

// Selection over the draft ids currently visible. When the visible ids change, anything no longer
// visible drops out, so a hidden draft can never be issued by accident.
export function useDraftSelection(selectableIds: string[]): DraftSelection {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [seenKey, setSeenKey] = useState(selectableIds.join(','))

  const key = selectableIds.join(',')
  let current = selected
  if (key !== seenKey) {
    // Adjusting state during render (not in an effect) avoids a frame showing hidden ids selected.
    current = new Set(selectableIds.filter((id) => selected.has(id)))
    setSeenKey(key)
    setSelected(current)
  }

  const selectedIds = selectableIds.filter((id) => current.has(id))

  function toggle(id: string): void {
    const next = new Set(current)
    if (next.has(id)) {
      next.delete(id)
    } else if (next.size < BULK_ISSUE_LIMIT) {
      next.add(id)
    }
    setSelected(next)
  }

  return {
    selectedIds,
    selectedCount: selectedIds.length,
    isAllSelected: selectableIds.length > 0 && selectedIds.length >= Math.min(selectableIds.length, BULK_ISSUE_LIMIT),
    isCapped: selectableIds.length > BULK_ISSUE_LIMIT,
    isSomeSelected: selectedIds.length > 0,
    isSelected: (id) => current.has(id),
    toggle,
    selectAll: () => setSelected(new Set(selectableIds.slice(0, BULK_ISSUE_LIMIT))),
    clear: () => setSelected(new Set()),
  }
}
