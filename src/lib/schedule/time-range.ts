import { format, parseISO } from 'date-fns'

const TIME_FORMAT = 'h:mm a'

export function formatTimeRange(date: string, startTime: string, endTime: string): string {
  const start = format(parseISO(`${date}T${startTime}`), TIME_FORMAT)
  const end = format(parseISO(`${date}T${endTime}`), TIME_FORMAT)
  return `${start} – ${end}`
}
