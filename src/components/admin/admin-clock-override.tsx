'use client'

import { useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateAppointmentEmployeeAdminNotes, updateClockTime } from '@/lib/actions/appointments'
import { fromBusinessWallClock, toBusinessWallClock } from '@/lib/schedule'

type AdminClockOverrideProps = {
  appointmentEmployees: Array<{
    id: string
    employee_id: string
    full_name: string
    phone: string | null
    clocked_in_at: string | null
    clocked_out_at: string | null
    admin_notes: string
  }>
}

type RowFeedback = {
  type: 'success' | 'error'
  message: string
} | null

// The datetime-local fields are Eastern wall time regardless of the browser's zone.
function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return ''
  }

  return format(toBusinessWallClock(parseISO(value)), "yyyy-MM-dd'T'HH:mm")
}

function toIsoValue(value: string) {
  if (!value) {
    return null
  }

  return fromBusinessWallClock(new Date(value)).toISOString()
}

function EmployeeClockRow({
  row,
}: {
  row: AdminClockOverrideProps['appointmentEmployees'][number]
}) {
  const [clockedInAt, setClockedInAt] = useState(toDateTimeLocalValue(row.clocked_in_at))
  const [clockedOutAt, setClockedOutAt] = useState(toDateTimeLocalValue(row.clocked_out_at))
  const [notes, setNotes] = useState(row.admin_notes ?? '')
  const [feedback, setFeedback] = useState<RowFeedback>(null)
  const [isPending, startTransition] = useTransition()

  const saveRow = () => {
    setFeedback(null)

    startTransition(async () => {
      const clockInResult = await updateClockTime(row.id, 'clocked_in_at', toIsoValue(clockedInAt))
      if (!clockInResult.success) {
        setFeedback({ type: 'error', message: clockInResult.error ?? 'Failed to update clock-in time.' })
        return
      }

      const clockOutResult = await updateClockTime(row.id, 'clocked_out_at', toIsoValue(clockedOutAt))
      if (!clockOutResult.success) {
        setFeedback({ type: 'error', message: clockOutResult.error ?? 'Failed to update clock-out time.' })
        return
      }

      const notesResult = await updateAppointmentEmployeeAdminNotes(row.id, notes)
      if (!notesResult.success) {
        setFeedback({ type: 'error', message: notesResult.error ?? 'Failed to save admin notes.' })
        return
      }

      setFeedback({ type: 'success', message: 'Saved successfully.' })
    })
  }

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-neutral-900">{row.full_name}</h4>
          <p className="text-xs text-neutral-500">{row.phone ?? 'No phone on file'}</p>
        </div>
        <Button
          type="button"
          onClick={saveRow}
          disabled={isPending}
          className="h-9 rounded-full bg-emerald-600 px-4 text-white hover:bg-emerald-700"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`clock-in-${row.id}`} className="text-xs font-medium text-neutral-600">
            Clock In
          </label>
          <Input
            id={`clock-in-${row.id}`}
            type="datetime-local"
            value={clockedInAt}
            onChange={(event) => setClockedInAt(event.target.value)}
            className="h-10 rounded-xl border-neutral-200 bg-white text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`clock-out-${row.id}`} className="text-xs font-medium text-neutral-600">
            Clock Out
          </label>
          <Input
            id={`clock-out-${row.id}`}
            type="datetime-local"
            value={clockedOutAt}
            onChange={(event) => setClockedOutAt(event.target.value)}
            className="h-10 rounded-xl border-neutral-200 bg-white text-sm"
          />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <label htmlFor={`admin-notes-${row.id}`} className="text-xs font-medium text-neutral-600">
          Admin Notes
        </label>
        <Textarea
          id={`admin-notes-${row.id}`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="min-h-20 rounded-xl border-neutral-200 bg-white text-sm"
        />
      </div>

      {feedback ? (
        <p className={`mt-2 text-xs ${feedback.type === 'error' ? 'text-red-600' : 'text-emerald-700'}`}>
          {feedback.message}
        </p>
      ) : null}
    </article>
  )
}

export function AdminClockOverride({ appointmentEmployees }: AdminClockOverrideProps) {
  if (appointmentEmployees.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-6 text-sm text-neutral-600">
        No employees are assigned to this appointment.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {appointmentEmployees.map((row) => (
        <EmployeeClockRow key={row.id} row={row} />
      ))}
    </div>
  )
}
