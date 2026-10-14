import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Clock, Pencil } from 'lucide-react'
import { notFound } from 'next/navigation'

import { buildTimeSheetsHref } from '@/components/admin/time-sheets/time-sheets-href'
import { Button, buttonVariants } from '@/components/ui/button'
import type { PayRateRow } from '@/lib/employees/pay-rates-view'
import { getBusinessDate } from '@/lib/schedule/business-time'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'

import { PaySection } from './pay-section'

type EmployeeDetailPageProps = {
	params: Promise<{ id: string }>
}

type EmployeeRow = {
	id: string
	full_name: string
	phone: string | null
	started_at: string | null
	address: string | null
	default_payout_method: string | null
	e_transfer_contact: string | null
	is_active: boolean
	is_archived: boolean
}

type AppointmentActivity = {
	clocked_in_at: string | null
	clocked_out_at: string | null
	appointments: {
		scheduled_date: string
		status: string
		jobs: {
			name: string
		}
		clients: {
			name: string
		}
	}
}

// Mirrors payroll_settings() (20261014120000). Ticket 06's Payroll module will own these; until then
// the period start is computed here, the same way pay_period_start() does.
const PAY_PERIOD_ANCHOR = '2026-10-05'
const PAYROLL_START = '2026-10-05'
const PAY_PERIOD_DAYS = 14
const MS_PER_DAY = 86_400_000

// UTC date arithmetic on yyyy-MM-dd strings, so no day shifts with the server's time zone.
function getPayPeriodStart(day: string): string {
	const anchor = Date.parse(`${PAY_PERIOD_ANCHOR}T00:00:00Z`)
	const daysSinceAnchor = Math.round((Date.parse(`${day}T00:00:00Z`) - anchor) / MS_PER_DAY)
	const periodIndex = Math.floor(daysSinceAnchor / PAY_PERIOD_DAYS)
	const start = new Date(anchor + periodIndex * PAY_PERIOD_DAYS * MS_PER_DAY).toISOString().slice(0, 10)
	// No Pay period exists in Payroll before the Payroll start.
	return start < PAYROLL_START ? PAYROLL_START : start
}

function clockStatus(activity: AppointmentActivity) {
	if (!activity.clocked_in_at) {
		return 'Not clocked in'
	}

	if (!activity.clocked_out_at) {
		return 'In progress'
	}

	return 'Completed'
}

export default async function EmployeeDetailPage({ params }: EmployeeDetailPageProps) {
	const { id } = await params
	const supabase = await createClient()

	const [
		{ data: employee, error: employeeError },
		{ data: activity, error: activityError },
		{ data: payRates, error: payRatesError },
	] = await Promise.all([
		supabase
			.from('employees')
			.select(
				'id, full_name, phone, started_at, address, default_payout_method, e_transfer_contact, is_active, is_archived'
			)
			.eq('id', id)
			.maybeSingle(),
		supabase
			.from('appointment_employees')
			.select(
				`
					clocked_in_at,
					clocked_out_at,
					appointments!inner (
						scheduled_date,
						status,
						jobs!inner ( name ),
						clients!inner ( name )
					)
				`
			)
			.eq('employee_id', id)
			// A visit she was removed from isn't her activity; NULL counts as live.
			.not('is_archived', 'is', true)
			.order('created_at', { ascending: false })
			.limit(5),
		supabase
			.from('pay_rates')
			.select('id, hourly_rate_cents, effective_from, is_archived, created_at')
			.eq('employee_id', id)
			.order('effective_from', { ascending: false }),
	])

	if (employeeError || !employee || employee.is_archived) {
		notFound()
	}

	if (payRatesError) console.error('Failed to load Pay rates for employee', id, payRatesError)

	const recentActivity = (activity ?? []) as unknown as AppointmentActivity[]
	const today = getBusinessDate(new Date())
	const rates: PayRateRow[] | null = payRatesError ? null : (payRates ?? [])

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-3">
						<Link
							href="/solutions/employees"
							className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
						>
							<ArrowLeft className="size-3.5" aria-hidden="true" />
							Back to Employees
						</Link>

						<div>
							<h1 className="text-3xl font-bold tracking-tight text-neutral-950">{employee.full_name}</h1>
							<div className="mt-2">
								<span
									className={`rounded-full px-2 py-1 text-xs font-medium ${
										employee.is_active
											? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
											: 'border border-neutral-200 bg-neutral-100 text-neutral-600'
									}`}
								>
									{employee.is_active ? 'Active' : 'Inactive'}
								</span>
							</div>
						</div>
					</div>

					<Link href={`/solutions/employees/${employee.id}/edit`}>
						<Button className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
							<Pencil className="size-4" aria-hidden="true" />
							Edit Employee
						</Button>
					</Link>
				</div>
			</section>

			<section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
				<h2 className="text-lg font-semibold text-neutral-950">Contact</h2>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Phone</p>
						<p className="mt-1 text-sm text-neutral-700">{employee.phone || 'No phone on file'}</p>
					</div>
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Status</p>
						<p className="mt-1 text-sm text-neutral-700">{employee.is_active ? 'Active' : 'Inactive'}</p>
					</div>
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Started At</p>
						<p className="mt-1 text-sm text-neutral-700">
							{employee.started_at
								? format(new Date(`${employee.started_at}T00:00:00`), 'MMM d, yyyy')
								: 'No start date on file'}
						</p>
					</div>
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Address</p>
						<p className="mt-1 text-sm text-neutral-700">{employee.address || 'No address on file'}</p>
					</div>
				</div>
			</section>

			<PaySection
				employeeId={employee.id}
				employeeName={employee.full_name}
				rates={rates}
				today={today}
				payrollStart={PAYROLL_START}
				payrollHref={`/solutions/payroll/${getPayPeriodStart(today)}`}
				defaultPayoutMethod={employee.default_payout_method}
				eTransferContact={employee.e_transfer_contact}
			/>

			<section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
				<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="text-lg font-semibold text-neutral-950">Recent Activity</h2>
						<p className="mt-1 text-sm text-neutral-600">Last five assigned appointments.</p>
					</div>
					<Link
						href={buildTimeSheetsHref({ cleaner: employee.id })}
						className={cn(buttonVariants({ variant: 'outline' }), 'active:bg-muted active:scale-[0.98]')}
					>
						View Time Sheets
					</Link>
				</div>

				{activityError ? (
					<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
						{activityError.message}
					</div>
				) : null}

				{recentActivity.length > 0 ? (
					<div className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
						{recentActivity.map((item, index) => (
							<article key={`${item.appointments.scheduled_date}-${index}`} className="px-4 py-3">
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="text-sm font-semibold text-neutral-900">{item.appointments.jobs.name}</p>
										<p className="text-sm text-neutral-600">{item.appointments.clients.name}</p>
										<p className="mt-1 text-xs text-neutral-500">
											{format(new Date(`${item.appointments.scheduled_date}T00:00:00`), 'MMM d, yyyy')}
										</p>
									</div>
									<div className="flex items-center gap-2 text-xs">
										<span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-neutral-700">
											<Clock className="size-3.5" aria-hidden="true" />
											{clockStatus(item)}
										</span>
										<span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
											{item.appointments.status}
										</span>
									</div>
								</div>
							</article>
						))}
					</div>
				) : (
					<div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-6 text-center text-sm text-neutral-600">
						No recent appointment activity yet.
					</div>
				)}
			</section>
		</div>
	)
}
