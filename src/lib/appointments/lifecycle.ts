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

// Editing is closed once a visit is finished or cancelled; the detail page and edit page share this.
export function canEdit(status: AppointmentStatus): boolean {
  return status !== 'completed' && status !== 'cancelled'
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
