'use client'

import { useEffect } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'

export const SHEET_BUTTON_CLASS = 'w-full active:scale-[0.98] sm:w-auto'

type SheetButtonsProps = {
  onCancel: () => void
  // Tells the sheet its form is submitting, so it can refuse to close until the result is in.
  onPendingChange?: (isPending: boolean) => void
  // The submit button, last so it sits on the right (and on top on phones).
  children: React.ReactNode
}

// The footer of a form inside a ResponsiveDialog: Cancel, then the submit. Lives inside the form so
// Cancel is disabled while the submit is pending.
export function SheetButtons({ onCancel, onPendingChange, children }: SheetButtonsProps) {
  const { pending } = useFormStatus()

  useEffect(() => {
    onPendingChange?.(pending)
    // A form unmounted mid-submit (the page re-rendered at a new status) mustn't leave its sheet locked.
    return () => onPendingChange?.(false)
  }, [pending, onPendingChange])

  return (
    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" className={SHEET_BUTTON_CLASS} disabled={pending} onClick={onCancel}>
        Cancel
      </Button>
      {children}
    </div>
  )
}
