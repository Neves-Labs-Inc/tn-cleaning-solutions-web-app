import Link from 'next/link'
import { addDays, format } from 'date-fns'
import { AlertCircle, AlertTriangle, CalendarX2, FileText, Wallet } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { toBusinessWallClock } from '@/lib/schedule'
import {
    formatDateLabel,
    formatTime,
    appointmentStatusBadgeClasses,
    assignedEmployeeNames,
    relationName,
    relationLocation,
} from '@/lib/helpers/dashboard'
import type {
    TodayAppointmentRow,
    UpcomingAppointmentRow
} from '@/lib/helpers/dashboard'
import { countUnbilledVisits, listInvoices } from '@/lib/invoices/queries'
import { receivablesTotals } from '@/lib/invoices/view'
import type { ReceivablesTotals } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import StatTile from '@/components/ui/stat-tile'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const RECEIVABLES_HREF = '/solutions/invoices/receivables'

type ReceivablesSummary = { totals: ReceivablesTotals; unbilledCount: number }
type Db = Awaited<ReturnType<typeof createClient>>

// A failed read returns null so the page shows an error, never a wrong $0.00.
async function loadReceivablesSummary(db: Db): Promise<ReceivablesSummary | null> {
    try {
        const [invoices, unbilledCount] = await Promise.all([listInvoices(db), countUnbilledVisits(db)])
        return { totals: receivablesTotals(invoices.filter((invoice) => !invoice.is_archived)), unbilledCount }
    } catch (error) {
        console.error('Dashboard receivables failed to load', error)
        return null
    }
}


export default async function DashboardPage() {
    const supabase = await createClient()

    const now = toBusinessWallClock(new Date())
    const today = format(now, 'yyyy-MM-dd')
    const tomorrowStr = format(addDays(now, 1), 'yyyy-MM-dd')
    const sevenDaysOutStr = format(addDays(now, 7), 'yyyy-MM-dd')

    const [
        todayAppointmentsResult,
        upcomingAppointmentsResult,
        receivables,
    ] = await Promise.all([
        supabase
            .from('appointments')
            .select(`id, scheduled_date, scheduled_start_time, scheduled_end_time, status,
      clients!inner(name), jobs!inner(name),
      client_locations(label, address),
      appointment_employees(employees!inner(full_name))`)
            .eq('scheduled_date', today)
            .neq('status', 'cancelled')
            .eq('is_archived', false)
            // A crew-removed Cleaner's archived assignment is history, not crew; NULL counts as live.
            .not('appointment_employees.is_archived', 'is', true)
            .order('scheduled_start_time'),

        supabase
            .from('appointments')
            .select(`id, scheduled_date, scheduled_start_time, status,
      clients!inner(name), jobs!inner(name)`)
            .gte('scheduled_date', tomorrowStr)
            .lte('scheduled_date', sevenDaysOutStr)
            .neq('status', 'cancelled')
            .eq('is_archived', false)
            .order('scheduled_date')
            .order('scheduled_start_time')
            .limit(8),

        loadReceivablesSummary(supabase),
    ])

    const loadError = todayAppointmentsResult.error ?? upcomingAppointmentsResult.error

    const todayAppointments = (todayAppointmentsResult.data ?? []) as unknown as TodayAppointmentRow[]
    const upcomingAppointments = (upcomingAppointmentsResult.data ?? []) as unknown as UpcomingAppointmentRow[]

    return (
        <div className="space-y-6 sm:space-y-8">
            <section className="rounded-3xl border border-emerald-900/40 bg-linear-to-br from-emerald-950 via-emerald-900 to-neutral-900 px-5 py-6 sm:px-8 sm:py-7 shadow-lg shadow-emerald-950/20">
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Admin Dashboard</p>
            </section>

            {loadError ? (
                <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError.message}</section>
            ) : null}

            {receivables ? (
                <section
                    aria-label="Receivables"
                    className="grid grid-cols-2 gap-3 animate-in fade-in-0 duration-slow sm:gap-4 md:grid-cols-4"
                >
                    <StatTile
                        fitValue
                        href={RECEIVABLES_HREF}
                        label="Outstanding"
                        value={formatCents(receivables.totals.outstandingCents)}
                        caption={receivables.totals.outstandingCents > 0 ? 'Issued invoices' : 'Nothing owed'}
                        icon={<Wallet className="size-5" aria-hidden="true" />}
                    />
                    <StatTile
                        fitValue
                        href={RECEIVABLES_HREF}
                        label="Overdue"
                        value={formatCents(receivables.totals.overdueCents)}
                        caption={receivables.totals.overdueCents > 0 ? 'Past due date' : 'Nothing past due'}
                        icon={<AlertTriangle className="size-5" aria-hidden="true" />}
                    />
                    <StatTile
                        fitValue
                        href={RECEIVABLES_HREF}
                        label="Unbilled"
                        value={String(receivables.unbilledCount)}
                        caption={receivables.unbilledCount > 0 ? 'Visits not invoiced' : 'All visits billed'}
                        icon={<CalendarX2 className="size-5" aria-hidden="true" />}
                    />
                    <StatTile
                        fitValue
                        href={RECEIVABLES_HREF}
                        label="Unpaid invoices"
                        value={String(receivables.totals.unpaidCount)}
                        caption={receivables.totals.unpaidCount > 0 ? 'Issued, not paid' : 'All paid up'}
                        icon={<FileText className="size-5" aria-hidden="true" />}
                    />
                </section>
            ) : (
                <section aria-label="Receivables" className="space-y-3">
                    <Alert variant="destructive">
                        <AlertCircle aria-hidden="true" />
                        <AlertTitle>Couldn&apos;t load receivables</AlertTitle>
                        <AlertDescription>Check your connection and try again.</AlertDescription>
                    </Alert>
                    <Link
                        href="/solutions/dashboard"
                        className={cn(buttonVariants({ variant: 'outline' }), 'active:bg-muted active:scale-[0.98]')}
                    >
                        Try again
                    </Link>
                </section>
            )}

            <section>
                <article className="min-w-0 rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-emerald-950/5 flex flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-4">
                        <h2 className="text-base font-semibold text-neutral-950">Today&apos;s Schedule</h2>
                        <Link href="/solutions/appointments" className="text-sm font-medium text-emerald-700 hover:text-emerald-800 shrink-0">
                            View all appointments
                        </Link>
                    </div>

                    <div className="divide-y divide-neutral-100">
                        {todayAppointments.length === 0 ? (
                            <p className="px-5 py-8 text-sm text-neutral-500">No appointments scheduled for today.</p>
                        ) : (
                            todayAppointments.slice(0, 10).map((appointment) => {
                                const clientName = relationName(appointment.clients)
                                const jobName = relationName(appointment.jobs)
                                const location = relationLocation(appointment.client_locations)

                                return (
                                    <Link
                                        key={appointment.id}
                                        href={`/solutions/appointments/${appointment.id}`}
                                        className="block px-5 py-4 transition-colors hover:bg-neutral-50"
                                    >
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[0.7rem] sm:text-xs font-semibold text-emerald-700 whitespace-nowrap">
                                                    {formatTime(appointment.scheduled_start_time)} - {formatTime(appointment.scheduled_end_time)}
                                                </span>
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-[0.65rem] sm:text-xs font-semibold uppercase tracking-wide shrink-0 ${appointmentStatusBadgeClasses(
                                                        appointment.status,
                                                    )}`}
                                                >
                                                    {appointment.status.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-neutral-950">{jobName}</p>
                                                <p className="truncate text-sm text-neutral-600">
                                                    {clientName}
                                                </p>
                                                {location ? (
                                                    <p className="truncate text-xs text-neutral-500 mt-0.5">
                                                        {location.label ? `${location.label} - ` : ''}
                                                        {location.address}
                                                    </p>
                                                ) : null}
                                                <p className="truncate text-xs text-neutral-400 mt-0.5">{assignedEmployeeNames(appointment)}</p>
                                            </div>
                                        </div>
                                    </Link>
                                )
                            })
                        )}
                    </div>
                </article>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-emerald-950/5">
                <div className="border-b border-neutral-100 px-5 py-4">
                    <h2 className="text-base font-semibold text-neutral-950">Upcoming This Week</h2>
                </div>

                <div className="divide-y divide-neutral-100">
                    {upcomingAppointments.length === 0 ? (
                        <p className="px-5 py-8 text-sm text-neutral-500">No upcoming appointments this week.</p>
                    ) : (
                        upcomingAppointments.map((appointment) => (
                            <Link
                                key={appointment.id}
                                href={`/solutions/appointments/${appointment.id}`}
                                className="block px-5 py-4 transition-colors hover:bg-neutral-50"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 space-y-1">
                                        <p className="truncate text-sm font-semibold text-neutral-950">{relationName(appointment.jobs)}</p>
                                        <p className="truncate text-sm text-neutral-600">{relationName(appointment.clients)}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-medium text-neutral-800">{formatDateLabel(appointment.scheduled_date)}</p>
                                        <p className="text-xs text-neutral-500">{formatTime(appointment.scheduled_start_time)}</p>
                                    </div>
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </section>
        </div>
    )
}