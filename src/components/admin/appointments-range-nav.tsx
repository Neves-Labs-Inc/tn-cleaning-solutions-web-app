'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'

type AppointmentsRangeNavProps = {
  // The range's name; a node so it can differ between phones and desktop.
  heading: React.ReactNode
  // So the caller can move focus here when the control that had it unmounts.
  headingId: string
  // The caller builds the target and navigates, so it can show the pending range.
  onPrev: () => void
  onNext: () => void
}

// Prev / heading / Next for the Week and List layouts. This week is placed by the caller, because its
// slot differs between phones and desktop.
export default function AppointmentsRangeNav({
  heading,
  headingId,
  onPrev,
  onNext,
}: AppointmentsRangeNavProps): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" className={PRESS_CLASS_NAME} onClick={onPrev}>
        <ChevronLeft aria-hidden="true" />
        Prev
      </Button>
      <div aria-live="polite" className="min-w-0 flex-1">
        <h2 id={headingId} tabIndex={-1} className="text-center text-sm font-semibold text-balance outline-none">
          {heading}
        </h2>
      </div>
      <Button type="button" variant="outline" className={PRESS_CLASS_NAME} onClick={onNext}>
        Next
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  )
}
