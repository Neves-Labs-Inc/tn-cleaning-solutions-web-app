import { notFound, redirect } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { MapPin } from 'lucide-react'

import { ClockActions } from '@/components/employee/clock-actions'
import { CrewRow, type CrewMember } from '@/components/employee/crew-row'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import StatusBadge, { appointmentStatusBadge, clockStatusBadge } from '@/components/ui/status-badge'
import { buildMapsUrl, getClockStatus } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import type { Views } from '@/types/database'
import type { AppointmentStatus } from '@/lib/appointments/lifecycle'

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
		manually_completed: boolean
		notes: string
		clients: {
			name: string
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

const DATE_FORMAT = 'EEE, MMM d'
const TIME_FORMAT = 'h:mm a'
const LINK_BUTTON_CLASSES = 'h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal wrap-anywhere active:bg-muted active:scale-[0.98]'

function formatTimeLabel(dateString: string, timeString: string) {
	return format(new Date(`${dateString}T${timeString}`), TIME_FORMAT)
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
					manually_completed,
					notes,
					clients!inner ( name ),
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
		// A re-added Cleaner also has her archived row from before; only the live one is hers.
		.not('is_archived', 'is', true)
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
		// Crew-removed teammates' archived rows aren't crew; NULL counts as live.
		.not('is_archived', 'is', true)

	const teamMembers: CrewMember[] = ((teamRows ?? []) as unknown as TeamMemberRecord[]).map((member) => ({
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

	const scheduled = appointment.appointments
	const client = scheduled.clients
	const job = scheduled.jobs
	const address = scheduled.client_locations?.address ?? null
	const currentMember = teamMembers.find((member) => member.id === currentEmployee.id)
	const currentClockStatus = getClockStatus(currentMember?.clocked_in_at ?? null, currentMember?.clocked_out_at ?? null)
	const statusBadge = appointmentStatusBadge(scheduled.status)
	const yourBadge = clockStatusBadge(currentClockStatus, currentMember?.clocked_in_at ?? null, currentMember?.clocked_out_at ?? null)
	// You first, then everyone else in fetched order (sort is stable).
	const orderedCrew = [...teamMembers].sort((a, b) => Number(b.id === currentEmployee.id) - Number(a.id === currentEmployee.id))

	return (
		<div className="mx-auto grid max-w-2xl grid-cols-1 animate-in gap-6 fade-in-0 duration-slow lg:max-w-4xl lg:grid-cols-2 lg:gap-8">
			<div className="space-y-3 md:row-start-1 lg:col-span-2">
				<h1 className="text-2xl font-semibold tracking-tight text-balance wrap-anywhere text-foreground">{job.name}</h1>
				{/* Keyed on the status so the pill zooms in once when a late clock-in reopens a completed visit. */}
				<span key={scheduled.status} className="inline-block animate-in fade-in-0 zoom-in-95 duration-base ease-out-quart">
					<StatusBadge tone={statusBadge.tone}>{statusBadge.label}</StatusBadge>
				</span>
				<p className="text-sm text-muted-foreground tabular-nums">
					{format(parseISO(scheduled.scheduled_date), DATE_FORMAT)} · {formatTimeLabel(scheduled.scheduled_date, scheduled.scheduled_start_time)} –{' '}
					{formatTimeLabel(scheduled.scheduled_date, scheduled.scheduled_end_time)}
				</p>
			</div>

			<div className="space-y-6 lg:col-start-1 lg:row-start-3">
				<Card className="shadow-sm">
					<CardHeader>
						<CardTitle className="text-base font-semibold wrap-anywhere">{client.name}</CardTitle>
					</CardHeader>
					{address ? (
						<CardContent className="text-sm leading-6">
							<Button variant="outline" className={LINK_BUTTON_CLASSES} render={<a href={buildMapsUrl(address)} target="_blank" rel="noopener" />} nativeButton={false}>
								<MapPin aria-hidden="true" />
								{address}
							</Button>
						</CardContent>
					) : null}
				</Card>

				<Card className="shadow-sm">
					<CardHeader>
						<CardTitle className="text-base font-semibold">Notes</CardTitle>
					</CardHeader>
					<CardContent>
						<p className={cn('text-base leading-7 wrap-anywhere whitespace-pre-line', scheduled.notes ? 'text-foreground' : 'text-muted-foreground')}>
							{scheduled.notes || 'No notes were added for this appointment.'}
						</p>
					</CardContent>
				</Card>
			</div>

			<Card className="gap-0 p-0 shadow-sm lg:col-start-2 lg:row-start-3 lg:self-start">
				<CardHeader className="px-4 py-4 sm:px-5">
					<CardTitle className="text-base font-semibold">Crew ({orderedCrew.length})</CardTitle>
				</CardHeader>
				<ul className="divide-y divide-border border-t">
					{orderedCrew.map((member) => (
						<CrewRow key={member.id} member={member} isCurrentUser={member.id === currentEmployee.id} />
					))}
				</ul>
			</Card>

			{/* Last in the DOM so sticky pins it under the scrolling crew list; lg:row-start-2 moves it under the summary. */}
			<div className="sticky bottom-[calc(3.5rem+var(--safe-bottom))] z-30 -mx-4 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur sm:-mx-6 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:row-start-2 md:shadow-none lg:col-span-2">
				<div className="md:max-w-sm">
					<p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
						Your status
						<StatusBadge key={currentClockStatus} tone={yourBadge.tone} icon={yourBadge.icon} className="animate-in zoom-in-95 duration-base">
							{yourBadge.label}
						</StatusBadge>
					</p>
					<ClockActions
						variant="bar"
						appointmentEmployeeId={currentAssignmentId}
						clockStatus={currentClockStatus}
						appointmentStatus={scheduled.status}
						manuallyCompleted={scheduled.manually_completed}
						jobName={job.name}
					/>
				</div>
			</div>
		</div>
	)
}
