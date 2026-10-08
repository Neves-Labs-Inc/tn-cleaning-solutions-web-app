import { endOfMonth, format, startOfMonth } from 'date-fns'
import { Briefcase, CheckCircle, Clock } from 'lucide-react'

import { EmployeeFilterField } from '@/components/admin/employee-filter-field'
import { WorkSessionsList } from '@/components/employee/work-sessions-list'
import { toBusinessWallClock } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'

type AdminTimeSheetsPageProps = {
	params?: Promise<Record<string, never>>
	searchParams?: Promise<{ month?: string | string[]; employee?: string | string[] }>
}

type TimeSheetRecord = {
	id: string
	clocked_in_at: string | null
	clocked_out_at: string | null
	appointments: {
		scheduled_date: string
		clients: {
			name: string
		}
		jobs: {
			name: string
		}
	}
}

type EmployeeOption = {
	id: string
	full_name: string
}

type DurationResult = {
	hours: number
	minutes: number
	totalMinutes: number
}

function calculateDuration(clockedIn: string | null, clockedOut: string | null): DurationResult {
	if (!clockedIn) {
		return { hours: 0, minutes: 0, totalMinutes: 0 }
	}

	const startedAt = new Date(clockedIn)
	const endedAt = clockedOut ? new Date(clockedOut) : new Date()
	const totalMinutes = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / (1000 * 60)))

	return {
		hours: Math.floor(totalMinutes / 60),
		minutes: totalMinutes % 60,
		totalMinutes,
	}
}

function formatDuration(hours: number, minutes: number): string {
	if (hours === 0 && minutes === 0) {
		return '0m'
	}

	if (hours === 0) {
		return `${minutes}m`
	}

	if (minutes === 0) {
		return `${hours}h`
	}

	return `${hours}h ${minutes}m`
}

function compareRecords(left: TimeSheetRecord, right: TimeSheetRecord) {
	let result: number

	if (left.clocked_in_at === null && right.clocked_in_at === null) {
		result = 0
	} else if (left.clocked_in_at === null) {
		result = 1
	} else if (right.clocked_in_at === null) {
		result = -1
	} else {
		result = new Date(right.clocked_in_at).getTime() - new Date(left.clocked_in_at).getTime()
	}

	return result
}

function parseMonth(month: string | string[] | undefined) {
	const firstValue = Array.isArray(month) ? month[0] : month
	if (!firstValue || !/^\d{4}-\d{2}$/.test(firstValue)) {
		return format(toBusinessWallClock(new Date()), 'yyyy-MM')
	}

	return firstValue
}

function parseEmployee(employee: string | string[] | undefined) {
	return Array.isArray(employee) ? employee[0] : employee
}

export default async function AdminTimeSheetsPage({
	params,
	searchParams,
}: AdminTimeSheetsPageProps) {
	if (params) {
		await params
	}

	const resolvedSearchParams: { month?: string | string[]; employee?: string | string[] } = searchParams
		? await searchParams
		: {}
	const selectedMonth = parseMonth(resolvedSearchParams.month)
	const requestedEmployeeId = parseEmployee(resolvedSearchParams.employee)
	const [year, month] = selectedMonth.split('-').map(Number)
	const selectedDate = new Date(year, month - 1, 1)

	const monthStart = startOfMonth(selectedDate)
	const monthEnd = endOfMonth(selectedDate)
	const monthStartLabel = format(monthStart, 'yyyy-MM-dd')
	const monthEndLabel = format(monthEnd, 'yyyy-MM-dd')

	const supabase = await createClient()

	const { data: employees, error: employeesError } = await supabase
		.from('employees')
		.select('id, full_name')
		.eq('is_archived', false)
		.order('full_name', { ascending: true })

	if (employeesError) {
		console.error('Error fetching employees for time sheets:', employeesError)
	}

	const employeeOptions = ((employees ?? []) as unknown as EmployeeOption[])
	const hasSelectedEmployee = employeeOptions.some((employee) => employee.id === requestedEmployeeId)
	const activeEmployeeId = hasSelectedEmployee ? requestedEmployeeId : ''

	let timeSheetsQuery = supabase
		.from('appointment_employees')
		.select(
			`
				id,
				clocked_in_at,
				clocked_out_at,
				appointments!inner (
					scheduled_date,
					clients!inner (
						name
					),
					jobs!inner (
						name
					)
				)
			`
		)
		.not('clocked_in_at', 'is', null)
		.gte('appointments.scheduled_date', monthStartLabel)
		.lte('appointments.scheduled_date', monthEndLabel)

	if (activeEmployeeId) {
		timeSheetsQuery = timeSheetsQuery.eq('employee_id', activeEmployeeId)
	}

	const { data: timeSheets, error } = await timeSheetsQuery

	if (error) {
		console.error('Error fetching time sheets:', error)
	}

	const records = ((timeSheets ?? []) as unknown as TimeSheetRecord[]).sort(compareRecords)

	const totalAppointments = records.length
	const totalMinutes = records.reduce(
		(sum, record) => sum + calculateDuration(record.clocked_in_at, record.clocked_out_at).totalMinutes,
		0
	)
	const totalHours = Math.floor(totalMinutes / 60)
	const totalRemainingMinutes = totalMinutes % 60
	const averageMinutes = totalAppointments > 0 ? Math.floor(totalMinutes / totalAppointments) : 0
	const averageHours = Math.floor(averageMinutes / 60)
	const averageRemainingMinutes = averageMinutes % 60

	return (
		<div className="space-y-8">
			<section className="relative overflow-hidden rounded-3xl border border-emerald-200/80 bg-white/90 p-6 shadow-sm shadow-emerald-950/5 sm:p-8">
				<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_36%),linear-gradient(135deg,rgba(16,185,129,0.05),transparent_60%)]" />
				<div className="relative space-y-6">
					<div className="space-y-3">
						<p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">Admin View</p>
						<h1 className="text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl">Time Sheets</h1>
						<p className="max-w-2xl text-sm leading-6 text-neutral-600 sm:text-base">
							Work sessions for {format(selectedDate, 'MMMM yyyy')}.
						</p>
					</div>

					<form className="grid gap-3 sm:max-w-2xl sm:grid-cols-[1fr_auto_auto] sm:items-end" method="get">
						<div className="space-y-2">
							<label
								htmlFor="employee"
								className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-600"
							>
								Employee
							</label>
							<EmployeeFilterField employees={employeeOptions} defaultValue={activeEmployeeId ?? ''} />
						</div>

						<div className="space-y-2">
							<label
								htmlFor="month"
								className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-600"
							>
								Month
							</label>
							<input
								id="month"
								name="month"
								type="month"
								defaultValue={selectedMonth}
								className="h-11 rounded-xl border border-emerald-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
							/>
						</div>

						<button
							type="submit"
							className="h-10 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
						>
							Apply
						</button>
					</form>

					<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{[
							{ label: 'Appointments', value: totalAppointments.toString(), icon: Briefcase },
							{ label: 'Total Hours', value: formatDuration(totalHours, totalRemainingMinutes), icon: Clock },
							{
								label: 'Avg per Job',
								value: totalAppointments > 0 ? formatDuration(averageHours, averageRemainingMinutes) : '—',
								icon: CheckCircle,
							},
						].map((stat) => (
							<div
								key={stat.label}
								className="rounded-xl border border-emerald-100 bg-white/80 px-3 py-2 shadow-sm shadow-emerald-950/5 backdrop-blur sm:rounded-2xl sm:px-4 sm:py-3"
							>
								<div className="flex items-center gap-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-neutral-500 sm:text-xs">
									<stat.icon className="size-3 text-emerald-600 sm:size-3.5" aria-hidden="true" />
									<span>{stat.label}</span>
								</div>
								<p className="mt-0.5 text-xl font-semibold text-neutral-950 sm:mt-1 sm:text-2xl">{stat.value}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<WorkSessionsList records={records} monthLabel={format(selectedDate, 'MMMM yyyy')} now={new Date().toISOString()} />
		</div>
	)
}