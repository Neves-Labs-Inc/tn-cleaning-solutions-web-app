import type { AppointmentStatus } from '@/lib/appointments/lifecycle'
import { isMissedClock, isNotClocked } from '../appointments/overview.ts'
import { appointmentDisplayBadge } from '../../components/ui/status-badge-tones.ts'
import type { StatusBadgeSpec } from '../../components/ui/status-badge'

export type { AppointmentStatus }

export type TodayAppointmentRow = {
    id: string
    scheduled_date: string
    scheduled_start_time: string
    scheduled_end_time: string
    status: AppointmentStatus
    clients: { name: string } | { name: string }[] | null
    jobs: { name: string } | { name: string }[] | null
    client_locations: { label: string | null; address: string } | Array<{ label: string | null; address: string }> | null
    appointment_employees:
        | Array<{
            employees: { full_name: string } | { full_name: string }[] | null
        }>
        | null
}

export type UpcomingAppointmentRow = {
    id: string
    scheduled_date: string
    scheduled_start_time: string
    status: AppointmentStatus
    clients: { name: string } | { name: string }[] | null
    jobs: { name: string } | { name: string }[] | null
}

export function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

export function relationName(value: { name: string } | { name: string }[] | null): string {
    if (!value) {
        return 'Unknown'
    }

    if (Array.isArray(value)) {
        return value[0]?.name ?? 'Unknown'
    }

    return value.name
}

export function relationLocation(
    value: { label: string | null; address: string } | Array<{ label: string | null; address: string }> | null,
): { label: string | null; address: string } | null {
    if (!value) {
        return null
    }

    if (Array.isArray(value)) {
        return value[0] ?? null
    }

    return value
}

export function parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

export function formatDateLabel(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(parseDateOnly(value))
}

export function formatLongDate(value: Date): string {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    }).format(value)
}

export function formatTime(value: string): string {
    const [hours, minutes] = value.split(':').map(Number)
    const date = new Date(2000, 0, 1, hours, minutes)

    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
    }).format(date)
}

// The pill every appointment surface paints, so the dashboard agrees with the Appointments screen.
export function todayAppointmentBadge(row: TodayAppointmentRow, now: Date): StatusBadgeSpec {
    const clockCheck = { status: row.status, scheduledDate: row.scheduled_date, endTime: row.scheduled_end_time }

    return appointmentDisplayBadge({
        status: row.status,
        isNotClocked: isNotClocked(clockCheck, now),
        isMissedClock: isMissedClock(clockCheck, now),
    })
}

export function assignedEmployeeNames(row: TodayAppointmentRow): string {
    if (!row.appointment_employees || row.appointment_employees.length === 0) {
        return 'Unassigned'
    }

    const names = row.appointment_employees
        .map((assignment) => {
            if (!assignment.employees) {
                return null
            }

            if (Array.isArray(assignment.employees)) {
                return assignment.employees[0]?.full_name ?? null
            }

            return assignment.employees.full_name
        })
        .filter((name): name is string => Boolean(name))

    if (names.length === 0) {
        return 'Unassigned'
    }

    return names.join(', ')
}
