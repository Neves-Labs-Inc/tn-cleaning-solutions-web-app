import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, Clock, Pencil } from 'lucide-react'
import { notFound } from 'next/navigation'

import { buildTimeSheetsHref } from '@/components/admin/time-sheets/time-sheets-href'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/server'

type EmployeeDetailPageProps = {
	params: Promise<{ id: string }>
}

type EmployeeRow = {
	id: string
	full_name: string
	phone: string | null
	started_at: string | null
	address: string | null
	e_transfer_email: string | null
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

	const [{ data: employee, error: employeeError }, { data: activity, error: activityError }] =
		await Promise.all([
			supabase
				.from('employees')
				.select(
					'id, full_name, phone, started_at, address, e_transfer_email, is_active, is_archived'
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
		])

	if (employeeError || !employee || employee.is_archived) {
		notFound()
	}

	const recentActivity = (activity ?? []) as unknown as AppointmentActivity[]

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
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
							E-transfer Email
						</p>
						<p className="mt-1 text-sm text-neutral-700">
							{employee.e_transfer_email || 'No e-transfer email on file'}
						</p>
					</div>
				</div>
			</section>

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
