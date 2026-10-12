const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

// Deliberate contract change from the three parsers this replaces: the appointments variant
// returned 'invalid' for unparseable input and null for an absent one. This returns null for
// both. A caller that must tell them apart checks whether the raw string was empty first.
export function parseDollarsToCents(raw: string): number | null {
  const trimmed = raw.trim()
  const parsed = Number(trimmed)
  let cents: number | null

  if (!trimmed || !Number.isFinite(parsed) || parsed < 0) {
    cents = null
  } else {
    cents = Math.round(parsed * 100)
  }

  return cents
}

// Shown in place of an amount for an Unpriced visit, so it is never mistaken for $0.
export const UNPRICED_LABEL = '—'

export function formatCents(cents: number): string {
  return cadFormatter.format(cents / 100)
}

export function formatRate(cents: number): string {
  return `${formatCents(cents)}/h`
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
