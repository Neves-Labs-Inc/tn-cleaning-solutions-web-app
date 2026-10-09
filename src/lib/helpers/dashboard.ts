import type { AppointmentStatus } from '@/lib/appointments/lifecycle'
import { formatBusinessDate } from '@/lib/schedule'

export type { AppointmentStatus }
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'
export type InvoiceEffectiveStatus = InvoiceStatus | 'overdue'

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

export type RecentInvoiceRow = {
    id: string
    status: InvoiceStatus
    total_cents: number
    created_at: string
    due_date: string | null
    clients: { name: string } | { name: string }[] | null
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

export function invoiceRef(id: string): string {
    return `INV-${id.slice(0, 8).toUpperCase()}`
}

export function formatCurrency(cents: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(cents / 100)
}

export function parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

export function formatCreatedAtDate(value: string): string {
    return formatBusinessDate(new Date(value))
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

export function statusBadgeClasses(status: InvoiceEffectiveStatus): string {
    if (status === 'draft') {
        return 'border border-blue-200 bg-blue-50 text-blue-700'
    }

    if (status === 'issued') {
        return 'border border-amber-200 bg-amber-50 text-amber-700'
    }

    if (status === 'paid') {
        return 'border border-emerald-200 bg-emerald-50 text-emerald-700'
    }

    if (status === 'overdue') {
        return 'border border-red-200 bg-red-50 text-red-700'
    }

    return 'border border-neutral-200 bg-neutral-100 text-neutral-700'
}

export function appointmentStatusBadgeClasses(status: AppointmentStatus): string {
    if (status === 'in_progress') {
        return 'border border-emerald-200 bg-emerald-50 text-emerald-700'
    }

    if (status === 'completed') {
        return 'border border-neutral-200 bg-neutral-100 text-neutral-700'
    }

    if (status === 'cancelled') {
        return 'border border-red-200 bg-red-50 text-red-600'
    }

    return 'border border-blue-200 bg-blue-50 text-blue-700'
}

export function invoiceEffectiveStatus(invoice: RecentInvoiceRow, today: string): InvoiceEffectiveStatus {
    if (invoice.status === 'issued' && invoice.due_date && invoice.due_date < today) {
        return 'overdue'
    }

    return invoice.status
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
