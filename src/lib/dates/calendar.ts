const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// True only for a yyyy-MM-dd string naming a real calendar day: 2028-02-29 yes, 2026-02-29 and 2026-02-31 no.
// Pure string/UTC arithmetic: no time zone, so no day ever shifts.
// The pattern only checks the shape; the round-trip rejects 2026-02-31, which Date would roll over.
export function isCalendarDate(value: string): boolean {
  let isValid = false;
  // Postgres has no year 0, and Date would accept it, so refuse it here.
  if (DATE_PATTERN.test(value) && !value.startsWith("0000-")) {
    const parsed = new Date(`${value}T00:00:00Z`);
    isValid =
      !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }
  return isValid;
}

// True only for HH:mm on a 24-hour clock, 00:00 through 23:59. 24:00, 25:00, 12:60 and 9:30 are false.
export function isClockTime(value: string): boolean {
  return CLOCK_TIME_PATTERN.test(value);
}
