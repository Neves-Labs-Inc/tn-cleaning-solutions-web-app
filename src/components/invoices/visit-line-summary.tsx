import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import StatusBadge, { lineStateBadge } from '@/components/ui/status-badge'
import type { LineState } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import { formatTimeRange } from '@/lib/schedule/time-range'
import { cn } from '@/lib/utils'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

// Date-only strings are read as UTC so the weekday never shifts with the viewer's zone.
export function formatVisitDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`))
}

type SetPriceLinkProps = {
  appointmentId: string
  jobName: string
  date: string
  className?: string
}

// Outside the row's label so tapping it navigates without toggling the checkbox.
export function SetPriceLink({ appointmentId, jobName, date, className }: SetPriceLinkProps) {
  return (
    <Link
      href={`/solutions/appointments/${appointmentId}/edit`}
      aria-label={`Set price for ${jobName} on ${formatVisitDate(date)}`}
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none transition-opacity duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 active:opacity-70 md:hover:underline',
        className
      )}
    >
      Set price
      <ArrowUpRight className="size-4" aria-hidden="true" />
    </Link>
  )
}

type VisitLineSummaryProps = {
  date: string
  startTime: string
  endTime: string
  jobName: string
  locationLabel: string | null
  states: LineState[]
  amountCents: number
  appointmentId: string
  // A Cancelled line: the text is struck and `billedAmountCents` shows struck beside the $0.00 it now charges.
  struck?: boolean
  billedAmountCents?: number | null
  // The Receivables tag for a visit the automatic run skips.
  isExcluded?: boolean
  // 'inline' puts the Set price link where the amount would be; 'none' leaves it to the caller (a checkbox row
  // keeps it outside its label via SetPriceLink).
  setPriceLink?: 'inline' | 'none'
  className?: string
}

// The middle of every visit row, so the date, pills and Unpriced treatment look the same on every
// invoice screen. The caller adds its own control (checkbox, remove button) beside it.
export function VisitLineSummary({
  date,
  startTime,
  endTime,
  jobName,
  locationLabel,
  states,
  amountCents,
  appointmentId,
  struck = false,
  billedAmountCents = null,
  isExcluded = false,
  setPriceLink = 'inline',
  className,
}: VisitLineSummaryProps) {
  const badges = states.flatMap((state) => {
    const badge = lineStateBadge(state)
    return badge ? [{ state, badge }] : []
  })
  // An Unpriced visit has no amount to show: the link to set one takes its place.
  const isSetPriceInline = states.includes('unpriced') && setPriceLink === 'inline'
  const hasBilledAmount = struck && billedAmountCents !== null
  const textStruck = struck ? 'line-through decoration-muted-foreground/60' : ''

  return (
    <div className={cn('min-w-0 flex-1', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-sm font-medium break-words', textStruck)}>
            {formatVisitDate(date)} ·{' '}
            <span className="font-mono text-xs tabular-nums whitespace-nowrap text-muted-foreground">
              {formatTimeRange(date, startTime, endTime)}
            </span>
          </p>
          <p className={cn('text-sm break-words text-muted-foreground', textStruck)}>
            {[jobName, locationLabel].filter(Boolean).join(' · ')}
          </p>
        </div>
        {isSetPriceInline ? (
          <SetPriceLink appointmentId={appointmentId} jobName={jobName} date={date} className="shrink-0" />
        ) : (
          <p className="shrink-0 text-right text-sm font-semibold tabular-nums">
            {hasBilledAmount ? (
              <span className="mr-2 font-normal text-muted-foreground line-through">{formatCents(billedAmountCents)}</span>
            ) : null}
            {formatCents(amountCents)}
          </p>
        )}
      </div>

      {badges.length > 0 || isExcluded ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {badges.map(({ state, badge }) => (
            <StatusBadge key={state} tone={badge.tone} icon={badge.icon}>
              {badge.label}
            </StatusBadge>
          ))}
          {isExcluded ? <StatusBadge tone="neutral">Excluded</StatusBadge> : null}
        </div>
      ) : null}
    </div>
  )
}
