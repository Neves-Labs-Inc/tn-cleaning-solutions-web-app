// Relative imports: node --test runs this file without the @/ alias.
import { isCalendarDate } from "../dates/calendar.ts";

const DATE_LENGTH = "yyyy-MM-dd".length;
// ISO-8601 with a zone, so V8's lenient forms ("2026-02-28 10:00") never reach Postgres.
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Date.parse rolls Feb 31 over to Mar 3, so the calendar day is checked on its own.
export function isInstantOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || !INSTANT_PATTERN.test(value)) return false;

  return !Number.isNaN(Date.parse(value)) && isCalendarDate(value.slice(0, DATE_LENGTH));
}
