export const BUSINESS_TIME_ZONE = 'America/New_York'

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number }

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hourCycle: 'h23',
})

function readWallClock(instant: Date): WallClock {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, Number(part.value)]))
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

// The business-local calendar date (YYYY-MM-DD) at the given instant.
export function getBusinessDate(instant: Date): string {
  const { year, month, day } = readWallClock(instant)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// A Date whose local fields equal the business wall clock. Appointment dates are stored as naive
// wall-clock strings and parsed in the process zone, so "now" must be expressed the same way.
export function toBusinessWallClock(instant: Date): Date {
  const { year, month, day, hour, minute, second } = readWallClock(instant)
  return new Date(year, month - 1, day, hour, minute, second)
}
