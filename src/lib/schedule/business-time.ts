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

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

// "h:mm AM" in business time. Parts are joined by hand because newer ICU puts a narrow no-break space before AM/PM.
export function formatBusinessTime(instant: Date): string {
  const parts = Object.fromEntries(timeFormatter.formatToParts(instant).map((part) => [part.type, part.value]))
  return `${parts.hour}:${parts.minute} ${parts.dayPeriod}`
}

// A Date whose local fields equal the business wall clock. Appointment dates are stored as naive
// wall-clock strings and parsed in the process zone, so "now" must be expressed the same way.
export function toBusinessWallClock(instant: Date): Date {
  const { year, month, day, hour, minute, second } = readWallClock(instant)
  return new Date(year, month - 1, day, hour, minute, second)
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

// "Oct 8, 2026" in business time. Parts are joined by hand to stay independent of ICU punctuation changes.
export function formatBusinessDate(instant: Date): string {
  const parts = Object.fromEntries(dateFormatter.formatToParts(instant).map((part) => [part.type, part.value]))
  return `${parts.month} ${parts.day}, ${parts.year}`
}

// "Oct 8, 2026, 1:21 PM" in business time.
export function formatBusinessDateTime(instant: Date): string {
  return `${formatBusinessDate(instant)}, ${formatBusinessTime(instant)}`
}

function toUtcMillis({ year, month, day, hour, minute, second }: WallClock): number {
  return Date.UTC(year, month - 1, day, hour, minute, second)
}

// Inverse of toBusinessWallClock: reads the local fields of `wallClock` as Eastern wall time and returns the real
// instant. The offset is re-measured at the first result so DST transitions resolve: during the repeated fall-back
// hour the earlier (EDT) instant wins; during the skipped spring-forward hour the result lands one hour later.
export function fromBusinessWallClock(wallClock: Date): Date {
  const guess = toUtcMillis({
    year: wallClock.getFullYear(),
    month: wallClock.getMonth() + 1,
    day: wallClock.getDate(),
    hour: wallClock.getHours(),
    minute: wallClock.getMinutes(),
    second: wallClock.getSeconds(),
  })
  const firstPass = guess - (toUtcMillis(readWallClock(new Date(guess))) - guess)
  const result = guess - (toUtcMillis(readWallClock(new Date(firstPass))) - firstPass)
  return new Date(result)
}
