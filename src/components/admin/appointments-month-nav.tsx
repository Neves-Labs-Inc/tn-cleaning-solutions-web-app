'use client'

import { addMonths, format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { AppointmentsQuery } from '@/lib/appointments/overview'

type AppointmentsMonthNavProps = {
  query: AppointmentsQuery
  // The caller navigates, so it can show the pending month.
  onNavigate: (target: AppointmentsQuery) => void
}

const BUTTON_CLASS = 'transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]'

export default function AppointmentsMonthNav({ query, onNavigate }: AppointmentsMonthNavProps): React.ReactNode {
  const monthDate = new Date(query.year, query.month - 1, 1)

  function handleStep(offset: number): void {
    const target = addMonths(monthDate, offset)
    onNavigate({ ...query, month: target.getMonth() + 1, year: target.getFullYear() })
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" className={BUTTON_CLASS} onClick={() => handleStep(-1)}>
        <ChevronLeft aria-hidden="true" />
        Prev
      </Button>
      <h2 className="min-w-0 flex-1 text-center text-sm font-semibold">{format(monthDate, 'MMMM yyyy')}</h2>
      <Button variant="outline" className={BUTTON_CLASS} onClick={() => handleStep(1)}>
        Next
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  )
}
