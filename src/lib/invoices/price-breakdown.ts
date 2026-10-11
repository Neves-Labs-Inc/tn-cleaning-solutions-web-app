import type { LivePrice } from '../pricing/index.ts'
import { formatRate } from '../pricing/money.ts'
import type { InvoiceStatus } from './view.ts'

export type BreakdownLine = {
  cancelled_at: string | null
  is_released: boolean
  billed_rate_cents: number | null
  billed_minutes: number | null
  visit: { live: LivePrice }
}

const MINUTES_PER_HOUR = 60
const MIN_HEADCOUNT = 1

const SOURCE_LABELS = { job: 'Job rate', client_job_pricing: 'Client rate' } as const

// 150 -> "2.5h", 180 -> "3h", 105 -> "1.75h"; 100 -> "1h 40m", 40 -> "40m" (1.67h would not multiply back
// to the amount, which pricing computes from exact minutes).
function formatHours(minutes: number): string {
  const isExactAtTwoDecimals = (minutes * 100) % MINUTES_PER_HOUR === 0
  if (isExactAtTwoDecimals) return `${minutes / MINUTES_PER_HOUR}h`

  const whole = Math.floor(minutes / MINUTES_PER_HOUR)
  const rest = minutes % MINUTES_PER_HOUR
  return whole === 0 ? `${rest}m` : `${whole}h ${rest}m`
}

function formatDraftBreakdown(live: LivePrice): string | null {
  if (live.source === 'unpriced') return null
  if (live.source === 'appointment_override') return 'Flat price (override)'
  if (live.rate_cents === null || live.minutes === null || live.minutes <= 0) return null

  const cleaners = Math.max(live.headcount, MIN_HEADCOUNT)
  const cleanerLabel = cleaners === 1 ? '1 cleaner' : `${cleaners} cleaners`
  return `${formatRate(live.rate_cents)} × ${formatHours(live.minutes)} × ${cleanerLabel} · ${SOURCE_LABELS[live.source]}`
}

function formatBilledBreakdown(line: BreakdownLine): string | null {
  if (line.billed_rate_cents === null || line.billed_minutes === null || line.billed_minutes <= 0) return null

  return `${formatRate(line.billed_rate_cents)} × ${formatHours(line.billed_minutes)}`
}

// The price math under a line's amount, or null when there is nothing to check. Issued lines carry no
// crew (headcount isn't frozen on issue), so they show rate × hours only.
export function formatPriceBreakdown(line: BreakdownLine, status: InvoiceStatus): string | null {
  if (line.cancelled_at !== null || line.is_released) return null

  return status === 'draft' ? formatDraftBreakdown(line.visit.live) : formatBilledBreakdown(line)
}
