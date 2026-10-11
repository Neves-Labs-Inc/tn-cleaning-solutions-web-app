export type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

type LifecycleState = {
  status: AppointmentStatus
  manually_completed: boolean
}

// Completed visits can be cancelled; only a cancelled one cannot.
export function canCancel(status: AppointmentStatus): boolean {
  return status !== 'cancelled'
}

export function canRestore(status: AppointmentStatus): boolean {
  return status === 'cancelled'
}

// A completed appointment stays editable (prices get corrected after the fact); a cancelled one is
// restored first. The detail page, edit page and updateAppointment share this.
export function canEdit(status: AppointmentStatus): boolean {
  return status !== 'cancelled'
}

type CompletedDateFacts = {
  status: AppointmentStatus
  // Both YYYY-MM-DD, so they compare as strings.
  scheduledDate: string
  businessDate: string
}

export const COMPLETED_FUTURE_DATE_ERROR = "A completed appointment can't move to a date after today."

// Work that already happened can't be scheduled for a day that hasn't come yet (Business date, Eastern).
export function completedDateError({ status, scheduledDate, businessDate }: CompletedDateFacts): string | null {
  const isFutureCompleted = status === 'completed' && scheduledDate > businessDate
  return isFutureCompleted ? COMPLETED_FUTURE_DATE_ERROR : null
}

export function canMarkComplete({ status, manually_completed }: LifecycleState): boolean {
  return status !== 'cancelled' && !manually_completed
}

// Cancel leaves the flag set, so a cancelled row must still return false.
export function canUndoComplete({ status, manually_completed }: LifecycleState): boolean {
  return status !== 'cancelled' && manually_completed
}

// A visit completed by its clocks still takes a late clock-in; a manual completion does not.
export function canClockIn({ status, manually_completed }: LifecycleState): boolean {
  return status !== 'cancelled' && !manually_completed
}
