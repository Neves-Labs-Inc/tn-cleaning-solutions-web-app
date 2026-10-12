'use client'

import type { AppointmentEstimate } from '@/lib/pricing/estimate'
import { formatCents, formatHours, formatRate } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

type CalculatedTotalProps = {
  estimate: AppointmentEstimate
}

const INCOMPLETE_CAPTION = 'Needs a Job and an end time after the start time.'
const RATE_CAPTIONS = {
  client_job_pricing: "Using this client's rate",
  job: 'Using the Job rate',
} as const

// The hourly price the save will bill, shown live while the admin edits the appointment.
export default function CalculatedTotal({ estimate }: CalculatedTotalProps): React.ReactNode {
  const isCalculated = estimate.kind === 'calculated'
  const isReplaced = isCalculated && estimate.overrideCents !== null

  return (
    <div aria-live="polite" aria-atomic="true" className="min-w-0 space-y-1 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-foreground">Calculated total</p>
      <p
        className={cn(
          'break-words text-pretty text-sm leading-6 tabular-nums text-foreground transition-colors duration-base',
          isReplaced && 'text-muted-foreground'
        )}
      >
        {isCalculated ? (
          <>
            {formatRate(estimate.rateCents)} × {formatHours(estimate.minutes)} × {estimate.cleaners}{' '}
            {estimate.cleaners === 1 ? 'cleaner' : 'cleaners'} ={' '}
            <span className="font-semibold whitespace-nowrap">{formatCents(estimate.amountCents)}</span>
            {isReplaced ? (
              <span className="animate-in fade-in-0 duration-base ease-out-quart"> · replaced by override</span>
            ) : null}
          </>
        ) : (
          <>
            <span aria-hidden="true">—</span>
            <span className="sr-only">Not calculated yet</span>
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {isCalculated ? RATE_CAPTIONS[estimate.rateSource] : INCOMPLETE_CAPTION}
      </p>
    </div>
  )
}
