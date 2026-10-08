import type { DurationResult } from '../../types/duration-result.ts'

const MS_PER_MINUTE = 60 * 1000
const MINUTES_PER_HOUR = 60

type SessionRecord = { clocked_in_at: string | null; clocked_out_at: string | null }

// The shared DurationResult has no completeness flag, so it is added here.
export type SessionDuration = DurationResult & { isComplete: boolean }

export function calculateDuration(
  clockedIn: string | null,
  clockedOut: string | null,
  now: Date
): SessionDuration {
  if (!clockedIn) return { hours: 0, minutes: 0, totalMinutes: 0, isComplete: false }

  const endedAt = clockedOut ? new Date(clockedOut) : now
  const elapsed = Math.floor((endedAt.getTime() - new Date(clockedIn).getTime()) / MS_PER_MINUTE)
  const totalMinutes = Math.max(0, elapsed)

  return {
    hours: Math.floor(totalMinutes / MINUTES_PER_HOUR),
    minutes: totalMinutes % MINUTES_PER_HOUR,
    totalMinutes,
    isComplete: clockedOut !== null,
  }
}

export function formatDuration(hours: number, minutes: number): string {
  if (hours === 0 && minutes === 0) return '0m'
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function summarizeSessions(
  records: SessionRecord[],
  now: Date
): { count: number; totalMinutes: number; averageMinutes: number } {
  const count = records.length
  const totalMinutes = records.reduce(
    (sum, record) => sum + calculateDuration(record.clocked_in_at, record.clocked_out_at, now).totalMinutes,
    0
  )
  const averageMinutes = count === 0 ? 0 : Math.floor(totalMinutes / count)

  return { count, totalMinutes, averageMinutes }
}
