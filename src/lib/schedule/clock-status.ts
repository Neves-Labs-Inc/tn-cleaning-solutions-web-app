export type ClockStatus = 'not_started' | 'clocked_in' | 'clocked_out'

export function getClockStatus(clockedInAt: string | null, clockedOutAt: string | null): ClockStatus {
  if (clockedOutAt) return 'clocked_out'
  if (clockedInAt) return 'clocked_in'
  return 'not_started'
}
