import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Calendar, CheckCircle, Clock, Phone, User } from 'lucide-react'
import { format, parseISO } from 'date-fns'

import { ClockActions } from '@/components/employee/clock-actions'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { Views } from '@/types/database'

type AppointmentStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
type ClockStatus = 'clocked_in' | 'clocked_out' | 'not_started'

type EmployeeSummary = {
	id: string
	full_name: string
	phone: string | null
}

type AppointmentRecord = {
	id: string
	appointment_id: string
	clocked_in_at: string | null
	clocked_out_at: string | null
	appointments: {
		id: string
		scheduled_date: string
		scheduled_start_time: string
		scheduled_end_time: string
		status: AppointmentStatus
		notes: string
		clients: {
			name: string
			phone: string | null
		}
		client_locations: {
			label: string
			address: string
		} | null
		jobs: {
			name: string
			description: string | null
		}
	}
}

type TeamMemberRecord = {
	appointment_id: string
	clocked_in_at: string | null
	clocked_out_at: string | null
	employees_employee_view: Pick<Views<'employees_employee_view'>, 'id' | 'full_name' | 'phone'>
}

function getClockStatus(clockedInAt: string | null, clockedOutAt: string | null): ClockStatus {
	if (clockedOutAt) {
		return 'clocked_out'
	}

	if (clockedInAt) {
		return 'clocked_in'
	}

	return 'not_started'
}

function formatDateLabel(dateString: string) {
	return format(parseISO(dateString), 'EEE, MMM d')
}

function formatTimeLabel(dateString: string, timeString: string) {
	return format(new Date(`${dateString}T${timeString}`), 'h:mm a')
}

function StatusBadge({ status }: { status: AppointmentStatus }) {
	const styles = {
		scheduled: 'border-blue-200 bg-blue-50 text-blue-700',
		in_progress: 'border-emerald-200 bg-emerald-50 text-emerald-700',
		completed: 'border-neutral-200 bg-neutral-100 text-neutral-600',
		cancelled: 'border-red-200 bg-red-50 text-red-700',
	}

	const labels = {
		scheduled: 'Scheduled',
		in_progress: 'In Progress',
		completed: 'Completed',
		cancelled: 'Cancelled',
	}

	return <span className={cn('rounded-full border px-2 py-1 text-xs font-medium tracking-tight', styles[status])}>{labels[status]}</span>
}

function ClockStatusPill({
	status,
	clockedInAt,
	clockedOutAt,
	isCurrentUser = false,
}: {
	status: ClockStatus
	clockedInAt: string | null
	clockedOutAt: string | null
	isCurrentUser?: boolean
}) {
	const styles = {
		clocked_in: 'border-emerald-200 bg-emerald-50 text-emerald-700',
		clocked_out: 'border-neutral-200 bg-neutral-100 text-neutral-600',
		not_started: 'border-amber-200 bg-amber-50 text-amber-700',
	}

	const labels = {
		clocked_in: clockedInAt ? `Clocked in at ${format(new Date(clockedInAt), 'h:mm a')}` : 'Clocked in',
		clocked_out: clockedOutAt ? `Clocked out at ${format(new Date(clockedOutAt), 'h:mm a')}` : 'Clocked out',
		not_started: 'Not started',
	}

	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[0.7rem] font-medium tracking-tight',
				styles[status],
				isCurrentUser && 'ring-1 ring-emerald-500/20'
			)}
		>
			{status === 'clocked_in' ? <CheckCircle className="size-3" aria-hidden="true" /> : <Clock className="size-3" aria-hidden="true" />}
			{labels[status]}
		</span>
	)
}

export default async function AppointmentDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const supabase = await createClient()
	const {
		data: { user },
	} = await supabase.auth.getUser()

	if (!user) {
		redirect('/login')
	}

	const { data: currentEmployee } = await supabase
		.from('employees')
		.select('id, full_name, phone')
		.eq('user_id', user.id)
		.single<EmployeeSummary>()

	if (!currentEmployee) {
		notFound()
	}

	const { data: assignmentRows, error: assignmentError } = await supabase
		.from('appointment_employees_employee_view')
		.select(
			`
				id,
				appointment_id,
				clocked_in_at,
				clocked_out_at,
				appointments:appointments_employee_view!inner (
					id,
					scheduled_date,
					scheduled_start_time,
					scheduled_end_time,
					status,
					notes,
					clients!inner (
						name,
						phone
					),
					client_locations (
						label,
						address
					),
					jobs:jobs_employee_view!inner (
						name,
						description
					)
				)
			`
		)
		.eq('employee_id', currentEmployee.id)
		.eq('appointment_id', id)
		.maybeSingle()

	if (assignmentError || !assignmentRows) {
		notFound()
	}

	const appointment = assignmentRows as unknown as AppointmentRecord
	const currentAssignmentId = appointment.id

	const { data: teamRows } = await supabase
		.from('appointment_employees_employee_view')
		.select(
			`
				appointment_id,
				clocked_in_at,
				clocked_out_at,
				employees_employee_view!inner (
					id,
					full_name,
					phone
				)
			`
		)
		.eq('appointment_id', appointment.appointment_id)

	const teamMembers = ((teamRows ?? []) as unknown as TeamMemberRecord[]).map((member) => ({
		id: member.employees_employee_view.id,
		full_name: member.employees_employee_view.full_name,
		phone: member.employees_employee_view.phone,
		clocked_in_at: member.clocked_in_at,
		clocked_out_at: member.clocked_out_at,
		clockStatus: getClockStatus(member.clocked_in_at, member.clocked_out_at),
	}))

	if (!teamMembers.some((member) => member.id === currentEmployee.id)) {
		teamMembers.push({
			id: currentEmployee.id,
			full_name: currentEmployee.full_name,
			phone: currentEmployee.phone,
			clocked_in_at: appointment.clocked_in_at,
			clocked_out_at: appointment.clocked_out_at,
			clockStatus: getClockStatus(appointment.clocked_in_at, appointment.clocked_out_at),
		})
	}

	const client = appointment.appointments.clients
	const job = appointment.appointments.jobs
	const currentMember = teamMembers.find((member) => member.id === currentEmployee.id)
	const currentClockStatus = getClockStatus(currentMember?.clocked_in_at ?? null, currentMember?.clocked_out_at ?? null)

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<Link
					href="/solutions/schedule"
					className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
				>
					<ArrowLeft className="size-3.5" aria-hidden="true" />
					Back to schedule
				</Link>
				<StatusBadge status={appointment.appointments.status} />
			</div>

			<section className="rounded-3xl border border-emerald-200/80 bg-white/90 p-6 shadow-sm shadow-emerald-950/5 sm:p-8">
				<div className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">Appointment detail</p>
					<h1 className="text-3xl font-semibold tracking-tight text-neutral-950">{job.name}</h1>
					<p className="text-sm leading-6 text-neutral-600">
						{formatDateLabel(appointment.appointments.scheduled_date)} · {formatTimeLabel(appointment.appointments.scheduled_date, appointment.appointments.scheduled_start_time)} - {formatTimeLabel(appointment.appointments.scheduled_date, appointment.appointments.scheduled_end_time)}
					</p>
				</div>
			</section>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
				<Card className="border-emerald-100 bg-white/95 shadow-sm shadow-emerald-950/5">
					<CardHeader className="border-b border-emerald-50 pb-4">
						<div className="flex items-center gap-2 text-sm text-neutral-600">
							<Calendar className="size-4 text-emerald-600" aria-hidden="true" />
							<span>{formatDateLabel(appointment.appointments.scheduled_date)}</span>
						</div>
					</CardHeader>
					<CardContent className="space-y-5 py-4">
						<div className="space-y-2">
							<h2 className="text-base font-semibold text-neutral-950">{client.name}</h2>
							{appointment.appointments.client_locations ? (
								<p className="text-sm text-neutral-600">
									{appointment.appointments.client_locations.address}
								</p>
							) : null}
							{client.phone ? (
								<a href={`tel:${client.phone}`} className="inline-flex items-center gap-2 text-sm text-emerald-700 transition-colors hover:text-emerald-800">
									<Phone className="size-4" aria-hidden="true" />
									<span>{client.phone}</span>
								</a>
							) : null}
						</div>

						<div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Notes</p>
							<p className="mt-2 text-sm leading-6 text-neutral-700">{appointment.appointments.notes || 'No notes were added for this appointment.'}</p>
						</div>
					</CardContent>
				</Card>

				<Card className="border-emerald-100 bg-white/95 shadow-sm shadow-emerald-950/5">
					<CardHeader className="border-b border-emerald-50 pb-4">
						<div className="flex items-center gap-2 text-sm text-neutral-600">
							<User className="size-4 text-emerald-600" aria-hidden="true" />
							<span>Team members and clock status</span>
						</div>
					</CardHeader>
					<CardContent className="space-y-4 py-4">
						<div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Your clock status</p>
							<p className="mt-1 text-sm text-neutral-700">
								{currentClockStatus === 'clocked_in'
									? 'You are currently clocked in on this appointment.'
									: currentClockStatus === 'clocked_out'
										? 'You have clocked out of this appointment.'
										: 'You have not started this appointment yet.'}
							</p>
							<div className="mt-3">
								<ClockStatusPill
									status={currentClockStatus}
									clockedInAt={currentMember?.clocked_in_at ?? null}
									clockedOutAt={currentMember?.clocked_out_at ?? null}
									isCurrentUser
								/>
							</div>
							<div className="mt-4">
								<ClockActions
									appointmentEmployeeId={currentAssignmentId}
									clockStatus={currentClockStatus}
									appointmentStatus={appointment.appointments.status}
									jobName={job.name}
								/>
							</div>
						</div>

						<div className="space-y-2 border-t border-emerald-50 pt-4">
							{teamMembers.map((member) => {
								const isCurrentUser = member.id === currentEmployee.id
								return (
									<div
										key={member.id}
										className={cn(
											'flex items-center justify-between gap-3 rounded-2xl border px-3 py-3',
											isCurrentUser ? 'border-emerald-200 bg-emerald-50/70' : 'border-neutral-200 bg-white'
										)}
									>
										<div className="min-w-0 space-y-1">
											<div className="flex items-center gap-2">
												<User className={cn('size-4', isCurrentUser ? 'text-emerald-600' : 'text-neutral-400')} aria-hidden="true" />
												<span className={cn('text-sm font-medium text-neutral-900', isCurrentUser && 'font-semibold text-emerald-800')}>
													{member.full_name}
												</span>
												{isCurrentUser ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700">You</span> : null}
											</div>
											{member.phone ? (
												<a href={`tel:${member.phone}`} className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-emerald-700">
													<Phone className="size-3.5" aria-hidden="true" />
													<span>{member.phone}</span>
												</a>
											) : (
												<p className="text-xs text-neutral-400">No phone on file</p>
											)}
										</div>
										<ClockStatusPill
											status={member.clockStatus}
											clockedInAt={member.clocked_in_at}
											clockedOutAt={member.clocked_out_at}
											isCurrentUser={isCurrentUser}
										/>
									</div>
								)
							})}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
