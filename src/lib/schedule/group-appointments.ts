import { addDays, compareAsc, isBefore, isSameDay, parseISO, startOfDay } from 'date-fns'

type Schedulable = { scheduled_date: string; scheduled_start_time: string }

const RECENT_WINDOW_DAYS = 7

function startOf(row: Schedulable): Date {
  return parseISO(`${row.scheduled_date}T${row.scheduled_start_time}`)
}

function sortByStartAsc<T extends Schedulable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareAsc(startOf(a), startOf(b)))
}

export function groupAppointmentsByDay<T extends Schedulable>(
  rows: T[],
  today: Date
): { today: T[]; upcoming: Array<{ date: string; items: T[] }>; recent: T[] } {
  const todayStart = startOfDay(today)
  const tomorrowStart = addDays(todayStart, 1)
  const recentCutoff = addDays(todayStart, -RECENT_WINDOW_DAYS)

  const todayRows = rows.filter((row) => isSameDay(startOf(row), today))
  const upcomingRows = rows.filter((row) => !isBefore(startOf(row), tomorrowStart))
  const recent = rows
    .filter((row) => isBefore(startOf(row), todayStart) && !isBefore(startOf(row), recentCutoff))
    .sort((a, b) => compareAsc(startOf(b), startOf(a)))

  const dates = [...new Set(upcomingRows.map((row) => row.scheduled_date))].sort()
  const upcoming = dates.map((date) => ({
    date,
    items: sortByStartAsc(upcomingRows.filter((row) => row.scheduled_date === date)),
  }))

  return { today: sortByStartAsc(todayRows), upcoming, recent }
}
