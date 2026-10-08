'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  type ClientJobPricingActionResult,
  createClientJobPricing,
  updateClientJobPricing,
} from '@/lib/actions/client-job-pricing'
import { formatRate } from '@/lib/pricing/money'
import { getBusinessDate } from '@/lib/schedule'

export type ClientJobPricingFormProps = {
  clientId: string
  jobs: Array<{ id: string; name: string; hourly_rate_cents: number }>
  pricing?: {
    id: string
    job_id: string
    hourly_rate_cents: number
    effective_from: string
    notes: string | null
  }
}

type FieldName = 'job_id' | 'hourly_rate_cents' | 'effective_from'

const initialState: ClientJobPricingActionResult = {
  success: false,
  error: '',
}

const fieldClassName =
  'h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20'

const labelClassName = 'text-sm font-medium text-neutral-700'

export function ClientJobPricingForm({ clientId, jobs, pricing }: ClientJobPricingFormProps) {
  const serverAction = pricing
    ? updateClientJobPricing.bind(null, pricing.id)
    : createClientJobPricing.bind(null, clientId)
  const [state, formAction] = useActionState(serverAction, initialState)
  const fieldErrors = 'fieldErrors' in state ? state.fieldErrors : undefined

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <form action={formAction} className="space-y-5">
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
          <Label htmlFor="job_id" className={labelClassName}>
            Job
          </Label>
          <select
            id="job_id"
            name="job_id"
            required
            defaultValue={pricing?.job_id ?? ''}
            aria-invalid={Boolean(fieldErrors?.job_id)}
            aria-describedby={describedBy('job_id', fieldErrors?.job_id)}
            className={`${fieldClassName} w-full border outline-none focus-visible:ring-3`}
          >
            <option value="" disabled>
              Select a job
            </option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name} — standard {formatRate(job.hourly_rate_cents)}
              </option>
            ))}
          </select>
          <FieldError field="job_id" message={fieldErrors?.job_id} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="hourly_rate_cents" className={labelClassName}>
            Rate ($/hour)
          </Label>
          <Input
            id="hourly_rate_cents"
            name="hourly_rate_cents"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            required
            defaultValue={pricing ? (pricing.hourly_rate_cents / 100).toFixed(2) : ''}
            aria-invalid={Boolean(fieldErrors?.hourly_rate_cents)}
            aria-describedby={describedBy('hourly_rate_cents', fieldErrors?.hourly_rate_cents, true)}
            className={fieldClassName}
          />
          <p id="hourly_rate_cents-help" className="text-xs text-neutral-500">
            Charged per scheduled hour for this client&apos;s appointments on this job.
          </p>
          <FieldError field="hourly_rate_cents" message={fieldErrors?.hourly_rate_cents} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="effective_from" className={labelClassName}>
            Effective from
          </Label>
          <Input
            id="effective_from"
            name="effective_from"
            type="date"
            required
            defaultValue={pricing?.effective_from ?? todayDateString()}
            aria-invalid={Boolean(fieldErrors?.effective_from)}
            aria-describedby={describedBy('effective_from', fieldErrors?.effective_from, true)}
            className={fieldClassName}
          />
          <p id="effective_from-help" className="text-xs text-neutral-500">
            Applies to appointments scheduled on or after this date. Earlier appointments keep the previous rate.
          </p>
          <FieldError field="effective_from" message={fieldErrors?.effective_from} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes" className={labelClassName}>
            Notes
          </Label>
          <Textarea
            id="notes"
            name="notes"
            defaultValue={pricing?.notes ?? ''}
            className="min-h-28 rounded-xl border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20"
            placeholder="e.g. Loyalty rate agreed Sept 2026"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-4">
          <Link
            href={`/solutions/clients/${clientId}/pricing`}
            className="inline-flex h-10 items-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <SubmitButton isEditMode={Boolean(pricing)} />
        </div>
      </form>
    </section>
  )
}

function SubmitButton({ isEditMode }: { isEditMode: boolean }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
    >
      {pending ? 'Saving...' : isEditMode ? 'Save changes' : 'Add rate'}
    </Button>
  )
}

function FieldError({ field, message }: { field: FieldName; message?: string }) {
  return message ? (
    <p id={`${field}-error`} className="text-xs text-red-600">
      {message}
    </p>
  ) : null
}

function describedBy(field: FieldName, message?: string, hasHelp = false) {
  const ids = [hasHelp ? `${field}-help` : null, message ? `${field}-error` : null].filter(Boolean)

  return ids.length > 0 ? ids.join(' ') : undefined
}

function todayDateString() {
  return getBusinessDate(new Date())
}
