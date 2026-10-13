import { isCalendarDate } from '../dates/calendar.ts'

// A blank date is null; one that isn't a real calendar day is undefined, which the action refuses.
export function readOptionalDate(formData: FormData, name: string): string | null | undefined {
  const value = String(formData.get(name) ?? '').trim()
  if (!value) return null

  return isCalendarDate(value) ? value : undefined
}
