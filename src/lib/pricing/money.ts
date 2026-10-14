const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

// Every money column is a Postgres integer (max $21,474,836.47), so typed amounts are capped well
// below it. Inclusive.
export const MAX_AMOUNT_CENTS = 100_000_000
export const AMOUNT_TOO_LARGE_MESSAGE = 'Enter an amount up to $1,000,000.00.'

// Digits with an optional point and decimals, or a point and digits. Rules out signs, $, commas,
// exponents, hex, Infinity and NaN, all of which Number() would otherwise accept or mangle.
// Each digit run splits only one way, so matching stays linear on hostile input (no ReDoS).
const PLAIN_DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/

export type ParsedDollars = { cents: number } | { error: 'invalid' | 'too_large' }

// Says why input was refused so each caller can show its own invalid message, or the shared cap
// message. Empty input is 'invalid'; a caller where empty means "no amount" checks that first.
// The cap is checked after rounding, so 1000000.004 still fits.
export function parseDollarsToCents(raw: string): ParsedDollars {
  const trimmed = raw.trim()
  if (!PLAIN_DECIMAL.test(trimmed)) return { error: 'invalid' }

  const cents = Math.round(Number(trimmed) * 100)
  return cents > MAX_AMOUNT_CENTS ? { error: 'too_large' } : { cents }
}

// Shown in place of an amount for an Unpriced visit, so it is never mistaken for $0.
export const UNPRICED_LABEL = '—'

export function formatCents(cents: number): string {
  return cadFormatter.format(cents / 100)
}

export function formatRate(cents: number): string {
  return `${formatCents(cents)}/h`
}

// A Job pay premium shown beside a Job rate; "None" keeps $0 from reading as a second price.
export function formatPremium(cents: number): string {
  return cents === 0 ? 'None' : `+${formatRate(cents)}`
}

const MINUTES_PER_HOUR = 60

// 150 -> "2.5h", 180 -> "3h", 105 -> "1.75h"; 100 -> "1h 40m", 40 -> "40m" (1.67h would not multiply
// back to the amount, which pricing computes from exact minutes).
export function formatHours(minutes: number): string {
  const isExactAtTwoDecimals = (minutes * 100) % MINUTES_PER_HOUR === 0
  if (isExactAtTwoDecimals) return `${minutes / MINUTES_PER_HOUR}h`

  const whole = Math.floor(minutes / MINUTES_PER_HOUR)
  const rest = minutes % MINUTES_PER_HOUR
  return whole === 0 ? `${rest}m` : `${whole}h ${rest}m`
}

export function durationMinutes(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)

  return endHour * 60 + endMinute - (startHour * 60 + startMinute)
}

export function hourlyAmountCents(rateCents: number, minutes: number): number {
  return Math.round((rateCents * minutes) / 60)
}
