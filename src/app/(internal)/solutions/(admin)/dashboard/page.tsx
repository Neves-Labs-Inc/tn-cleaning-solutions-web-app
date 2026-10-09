import Link from 'next/link'
import { addDays, format } from 'date-fns'
import { AlertCircle, CalendarDays, CheckCircle, FileText, Users } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { toBusinessWallClock } from '@/lib/schedule'
import { 
    formatCreatedAtDate, 
    formatDateLabel, 
    formatTime, 
    appointmentStatusBadgeClasses, 
    assignedEmployeeNames,
    relationName,
    relationLocation,
} from '@/lib/helpers/dashboard'
import type { 
    TodayAppointmentRow, 
    RecentInvoiceRow, 
    UpcomingAppointmentRow 
} from '@/lib/helpers/dashboard'
import StatusBadge, { invoiceStatusBadge } from '@/components/ui/status-badge'
import { effectiveStatus, invoiceLabel } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import StatCard from '@/components/dashboard/statCard'


export default async function DashboardPage() {
    const supabase = await createClient()

    const now = toBusinessWallClock(new Date())
    const today = format(now, 'yyyy-MM-dd')
    const tomorrowStr = format(addDays(now, 1), 'yyyy-MM-dd')
    const sevenDaysOutStr = format(addDays(now, 7), 'yyyy-MM-dd')

    const [
        todayAppointmentsResult,
        openInvoicesResult,
        overdueInvoicesResult,
        paidInvoicesResult,
        totalInvoicesResult,
        recentInvoicesResult,
        upcomingAppointmentsResult,
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
            .order('scheduled_start_time'),

        supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'issued')
            .eq('is_archived', false),

        supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'issued')
            .lt('due_date', today)
            .eq('is_archived', false),

        supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'paid')
            .eq('is_archived', false),
        
        supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('is_archived', false),

        supabase
            .from('invoices_with_status')
            .select(`id, status, invoice_number, total_cents, created_at, due_date, clients!inner(name)`)
            .eq('is_archived', false)
            .order('created_at', { ascending: false })
            .limit(5),

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
    ])

    const loadError =
        todayAppointmentsResult.error ??
        openInvoicesResult.error ??
        overdueInvoicesResult.error ??
        paidInvoicesResult.error ??
        recentInvoicesResult.error ??
        upcomingAppointmentsResult.error

    const todayAppointments = (todayAppointmentsResult.data ?? []) as unknown as TodayAppointmentRow[]
    const recentInvoices = (recentInvoicesResult.data ?? []) as unknown as RecentInvoiceRow[]
    const upcomingAppointments = (upcomingAppointmentsResult.data ?? []) as unknown as UpcomingAppointmentRow[]

    const paidInvoicesCount = paidInvoicesResult.count ?? 0
    const openInvoicesCount = openInvoicesResult.count ?? 0
    const overdueInvoicesCount = overdueInvoicesResult.count ?? 0
    const totalInvoicesCount = totalInvoicesResult.count ?? 0

    const statCards = [
        {
            statValue: openInvoicesCount,
            statLabel: "Open Invoices",
            statDescription: "Invoices that are currently open and awaiting payment.",
            href: "/solutions/invoices",
            icon: <FileText className="size-4 sm:size-5" aria-hidden="true" />,
            classColor: "bg-amber-50 text-amber-700",
            borderColor: { color: 'border-amber-200', onHover: 'amber-300' },
            shadowColor: "shadow-emerald-950/5",
        },
        {
            statValue: overdueInvoicesCount,
            statLabel: "Overdue Invoices",
            statDescription: "Invoices that are past their due date and require immediate attention.",
            href: "/solutions/invoices",
            icon: <AlertCircle className="size-4 sm:size-5" aria-hidden="true" />,
            classColor: "bg-red-50 text-red-700",
            borderColor: { color: 'border-red-200', onHover: 'red-300' },
            shadowColor: "shadow-emerald-950/5",
        },
        {
            statValue: paidInvoicesCount,
            statLabel: "Paid Invoices",
            statDescription: "Invoices that have been paid in full.",
            href: "/solutions/invoices",
            icon: <CheckCircle className="size-4 sm:size-5" aria-hidden="true" />,
            classColor: "bg-green-50 text-green-700",
            borderColor: { color: 'border-green-200', onHover: 'green-300' },
            shadowColor: "shadow-emerald-950/5",
        },
        {
            statValue: totalInvoicesCount,
            statLabel: "Total Invoices",
            statDescription: "All invoices regardless of their status.",
            href: "/solutions/invoices",
            icon: <FileText className="size-4 sm:size-5" aria-hidden="true" />,
            classColor: "bg-blue-50 text-blue-700",
            borderColor: { color: 'border-blue-200', onHover: 'blue-300' },
            shadowColor: "shadow-emerald-950/5",
        }
    ]

    return (
        <div className="space-y-6 sm:space-y-8">
            <section className="rounded-3xl border border-emerald-900/40 bg-linear-to-br from-emerald-950 via-emerald-900 to-neutral-900 px-5 py-6 sm:px-8 sm:py-7 shadow-lg shadow-emerald-950/20">
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Admin Dashboard</p>
            </section>

            {loadError ? (
                <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError.message}</section>
            ) : null}

            <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">

                {statCards.map((card, index) => (
                    <StatCard
                        key={index}
                        statValue={card.statValue}
                        statLabel={card.statLabel}
                        statDescription={card.statDescription}
                        href={card.href}
                        icon={card.icon}
                        classColor={card.classColor}
                        borderColor={card.borderColor}
                        shadowColor={card.shadowColor}
                    />
                ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
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

                <article className="min-w-0 rounded-2xl border border-neutral-200 bg-white shadow-sm shadow-emerald-950/5 flex flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-5 py-4">
                        <h2 className="text-base font-semibold text-neutral-950">Recent Invoices</h2>
                        <Link href="/solutions/invoices" className="text-sm font-medium text-emerald-700 hover:text-emerald-800 shrink-0">
                            View all invoices
                        </Link>
                    </div>

                    <div className="divide-y divide-neutral-100">
                        {recentInvoices.length === 0 ? (
                            <p className="px-5 py-8 text-sm text-neutral-500">No invoices found.</p>
                        ) : (
                            recentInvoices.map((invoice) => {
                                const badge = invoiceStatusBadge(effectiveStatus(invoice, today))

                                return (
                                    <Link
                                        key={invoice.id}
                                        href={`/solutions/invoices/${invoice.id}`}
                                        className="block px-5 py-4 transition-colors hover:bg-neutral-50"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 space-y-1">
                                                <p className="text-sm font-semibold text-neutral-950 truncate">{invoiceLabel(invoice)}</p>
                                                <p className="truncate text-sm text-neutral-600">{relationName(invoice.clients)}</p>
                                                <p className="text-xs text-neutral-500">Created {formatCreatedAtDate(invoice.created_at)}</p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <StatusBadge tone={badge.tone} icon={badge.icon} className="ml-auto">
                                                    {badge.label}
                                                </StatusBadge>
                                                <p className="mt-2 text-sm font-semibold text-neutral-950">{formatCents(invoice.total_cents)}</p>
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