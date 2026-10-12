'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useInvalidateAppointments } from '@/hooks/use-invalidate-appointments'
import { createJob, type JobActionResult, updateJob } from '@/lib/actions/jobs'

type JobFormProps = {
  job?: {
    id: string
    name: string
    description: string | null
    hourly_rate_cents: number
    estimated_duration_minutes: number | null
  }
}

const helperText = 'text-xs text-neutral-500'

const initialState: JobActionResult = {
  success: false,
  error: '',
}

function SubmitButton({ isEditMode }: { isEditMode: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
    >
      {pending ? 'Saving...' : isEditMode ? 'Save changes' : 'Create job'}
    </Button>
  )
}

export function JobForm({ job }: JobFormProps) {
  const serverAction = job ? updateJob.bind(null, job.id) : createJob
  const [state, formAction] = useActionState(serverAction, initialState)
  const invalidateAppointments = useInvalidateAppointments()

  // A saved form never gets a result back: the action redirects. So discard at submit, before the
  // action runs; a refused save costs one skeleton. Not prevented, so the action still dispatches.
  function handleSubmit() {
    void invalidateAppointments()
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <form action={formAction} onSubmit={handleSubmit} className="space-y-5">
        {'error' in state && state.error ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            {state.error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-sm font-medium text-neutral-700">
            Name
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={job?.name ?? ''}
            aria-invalid={'fieldErrors' in state && Boolean(state.fieldErrors?.name)}
            aria-describedby={'fieldErrors' in state && state.fieldErrors?.name ? 'name-error' : undefined}
            className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
            placeholder="Standard Deep Cleaning"
          />
          {'fieldErrors' in state && state.fieldErrors?.name ? (
            <p id="name-error" className="text-xs text-red-600">
              {state.fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-sm font-medium text-neutral-700">
            Description
          </Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={job?.description ?? ''}
            className="min-h-28 rounded-xl border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
            placeholder="Describe what this service includes."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hourly_rate_cents" className="text-sm font-medium text-neutral-700">
              Hourly Rate ($/hour)
            </Label>
            <Input
              id="hourly_rate_cents"
              name="hourly_rate_cents"
              type="number"
              step="0.01"
              min="0"
              required
              defaultValue={
                job ? (job.hourly_rate_cents / 100).toFixed(2) : ''
              }
              aria-invalid={
                'fieldErrors' in state && Boolean(state.fieldErrors?.hourly_rate_cents)
              }
              aria-describedby={
                'fieldErrors' in state && state.fieldErrors?.hourly_rate_cents
                  ? 'rate-help rate-error'
                  : 'rate-help'
              }
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
              placeholder="45.00"
            />
            <p id="rate-help" className={helperText}>
              Charged per scheduled hour. A 2h 30m appointment at $45.00/h bills $112.50.
            </p>
            {'fieldErrors' in state && state.fieldErrors?.hourly_rate_cents ? (
              <p id="rate-error" className="text-xs text-red-600">
                {state.fieldErrors.hourly_rate_cents}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="estimated_duration_minutes"
              className="text-sm font-medium text-neutral-700"
            >
              Est. Duration (minutes)
            </Label>
            <Input
              id="estimated_duration_minutes"
              name="estimated_duration_minutes"
              type="number"
              min="1"
              step="1"
              defaultValue={job?.estimated_duration_minutes ?? ''}
              aria-invalid={
                'fieldErrors' in state &&
                Boolean(state.fieldErrors?.estimated_duration_minutes)
              }
              aria-describedby={
                'fieldErrors' in state && state.fieldErrors?.estimated_duration_minutes
                  ? 'duration-help duration-error'
                  : 'duration-help'
              }
              className="h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
              placeholder="120"
            />
            <p id="duration-help" className={helperText}>
              Estimate used for scheduling only. It does not affect the price.
            </p>
            {'fieldErrors' in state && state.fieldErrors?.estimated_duration_minutes ? (
              <p id="duration-error" className="text-xs text-red-600">
                {state.fieldErrors.estimated_duration_minutes}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-4">
          <Link
            href="/solutions/jobs"
            className="inline-flex h-10 items-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <SubmitButton isEditMode={Boolean(job)} />
        </div>
      </form>
    </section>
  )
}
