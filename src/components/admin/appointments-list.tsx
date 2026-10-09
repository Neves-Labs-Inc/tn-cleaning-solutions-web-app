'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { addMonths, format, parseISO } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import type { AppointmentSummary } from '@/components/admin/appointments-types'
import { Button } from '@/components/ui/button'
import { formatCents, UNPRICED_LABEL } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

type AppointmentsListProps = {
  appointments: AppointmentSummary[]
  month: number
  year: number
}

function statusClasses(status: AppointmentSummary['status']) {
  if (status === 'in_progress') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  if (status === 'completed') {
    return 'border border-neutral-200 bg-neutral-100 text-neutral-700'
  }

  if (status === 'cancelled') {
    return 'border border-red-200 bg-red-50 text-red-600'
  }

  return 'border border-blue-200 bg-blue-50 text-blue-700'
}

export function AppointmentsList({ appointments, month, year }: AppointmentsListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const monthDate = new Date(year, month - 1, 1)

  const grouped = useMemo(() => {
    const map = new Map<string, AppointmentSummary[]>()

    for (const appointment of appointments) {
      const list = map.get(appointment.scheduled_date) ?? []
      list.push(appointment)
      map.set(appointment.scheduled_date, list)
    }

    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [appointments])

  const navigateMonth = (offset: number) => {
    const target = addMonths(monthDate, offset)
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', String(target.getMonth() + 1))
    params.set('year', String(target.getFullYear()))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-950/5">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-full"
          onClick={() => navigateMonth(-1)}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Prev
        </Button>
        <h2 className="text-sm font-semibold text-neutral-900">{format(monthDate, 'MMMM yyyy')}</h2>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-full"
          onClick={() => navigateMonth(1)}
        >
          Next
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {grouped.length > 0 ? (
        <div className="space-y-4">
          {grouped.map(([dateKey, items]) => (
            <div key={dateKey} className="space-y-2.5">
              <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
                <CalendarDays className="size-4 text-emerald-600" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-neutral-900">
                  {format(parseISO(dateKey), 'EEEE, MMMM d')}
                </h3>
              </div>

              <div className="space-y-2">
                {items.map((appointment) => (
                  <Link
                    key={appointment.id}
                    href={`/solutions/appointments/${appointment.id}`}
                    className="block rounded-xl border border-neutral-200 bg-white px-3.5 py-3 shadow-sm shadow-emerald-950/5 transition-colors hover:border-emerald-200 hover:bg-emerald-50/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">{appointment.job.name}</p>
                        <p className="text-sm text-neutral-600">{appointment.client.name}</p>
                        <p className="mt-1 text-xs font-medium text-neutral-500">
                          {appointment.scheduled_start_time.slice(0, 5)} - {appointment.scheduled_end_time.slice(0, 5)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span
                          className={cn(
                            'rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide',
                            statusClasses(appointment.status)
                          )}
                        >
                          {appointment.status.replace('_', ' ')}
                        </span>
                        <p className="text-sm font-semibold text-neutral-900">
                          {appointment.price_display_cents === null
                            ? UNPRICED_LABEL
                            : formatCents(appointment.price_display_cents)}
                        </p>
                        {appointment.price_is_billed ? (
                          <span className="rounded-full border border-neutral-200 bg-neutral-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">
                            Invoiced
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {appointment.assignedEmployees.length > 0 ? (
                      <div className="mt-2.5 flex items-center gap-2 text-xs text-neutral-600">
                        <Users className="size-3.5 text-emerald-600" aria-hidden="true" />
                        <span className="truncate">
                          {appointment.assignedEmployees.map((employee) => employee.full_name).join(', ')}
                        </span>
                      </div>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-8 text-center">
          <p className="text-sm text-neutral-600">No appointments in this month.</p>
        </div>
      )}

      <div className="fixed right-5 bottom-5 z-10 md:hidden">
        <Link href="/solutions/appointments/new">
          <Button className="h-12 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 hover:bg-emerald-700">
            <Plus className="size-4" aria-hidden="true" />
            New
          </Button>
        </Link>
      </div>
    </section>
  )
}
