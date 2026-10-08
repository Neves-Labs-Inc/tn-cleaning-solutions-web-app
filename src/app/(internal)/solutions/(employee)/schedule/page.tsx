import { redirect } from 'next/navigation'
import { AlertCircle, CalendarCheck, CalendarDays, ChevronDown, History, type LucideIcon } from 'lucide-react'
import { format, parseISO } from 'date-fns'

import { ScheduleRow } from '@/components/employee/schedule-row'
import { ScheduleTodayCard } from '@/components/employee/schedule-today-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import PageHeader from '@/components/ui/page-header'
import {
	buildStop,
	groupAppointmentsByDay,
	toBusinessWallClock,
	type AppointmentRecord,
	type EmployeeSummary,
	type TeamMemberRecord,
} from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import type { ScheduleStop } from '@/types/schedule'

const DAY_LABEL_FORMAT = 'EEE, MMM d'

function ScheduleEmpty({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
	return (
		<Empty className="border">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle className="text-base font-semibold">{title}</EmptyTitle>
				<EmptyDescription className="text-sm">{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	)
}

function ScheduleAlert({ title, description, isWarning = false }: { title: string; description: string; isWarning?: boolean }) {
	return (
		<Alert
			variant={isWarning ? 'default' : 'destructive'}
			className={isWarning ? 'border-status-warning-border bg-status-warning text-sm text-status-warning-foreground' : 'text-sm'}
		>
			<AlertCircle aria-hidden="true" />
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription className={isWarning ? 'text-sm text-status-warning-foreground' : 'text-sm'}>{description}</AlertDescription>
		</Alert>
	)
}

function ScheduleRows({ stops, shouldHideIdleClock }: { stops: ScheduleStop[]; shouldHideIdleClock: boolean }) {
	return (
		<Card className="gap-0 divide-y divide-border p-0 text-sm">
			{stops.map((stop, index) => (
				<ScheduleRow key={stop.id} stop={stop} index={index} shouldHideIdleClock={shouldHideIdleClock} />
			))}
		</Card>
	)
}

export default async function SchedulePage() {
	const supabase = await createClient()
	const {
		data: { user },
	} = await supabase.auth.getUser()

	if (!user) {
		redirect('/login')
	}

	// Servers run in UTC; "today" must be the business day (Eastern), not the server's.
	const now = toBusinessWallClock(new Date())
	const header = <PageHeader title={`Today · ${format(now, DAY_LABEL_FORMAT)}`} />

	const { data: currentEmployee, error: currentEmployeeError } = await supabase
		.from('employees')
		.select('id, full_name, phone')
		.eq('user_id', user.id)
		.single<EmployeeSummary>()

	if (currentEmployeeError || !currentEmployee) {
		return (
			<div className="space-y-6">
				{header}
				<ScheduleAlert
					isWarning
					title="No employee profile yet"
					description="We could not find an employee profile for this account. Contact admin so your profile can be linked before you can see assignments."
				/>
			</div>
		)
	}

	const { data: currentAssignments, error: appointmentsError } = await supabase
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

	if (appointmentsError) {
		console.error('Error fetching appointments:', appointmentsError)
		return (
			<div className="space-y-6">
				{header}
				<ScheduleAlert
					title="Couldn't load your schedule"
					description="We could not load your assignments right now. Please try again in a moment or contact admin if the problem continues."
				/>
			</div>
		)
	}

	const appointmentRows = (currentAssignments ?? []) as unknown as AppointmentRecord[]
	const appointmentIds = appointmentRows.map((appointment) => appointment.appointment_id)

	const { data: allTeamRows, error: teamError } = appointmentIds.length
		? await supabase
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
				.in('appointment_id', appointmentIds)
		: { data: [], error: null }

	if (teamError) {
		console.error('Error fetching team assignments:', teamError)
		return (
			<div className="space-y-6">
				{header}
				<ScheduleAlert
					title="Couldn't load your schedule"
					description="We could not load your team assignments right now. Please try again in a moment or contact admin if the problem continues."
				/>
			</div>
		)
	}

	const teamRows = (allTeamRows ?? []) as TeamMemberRecord[]
	const stops = appointmentRows.map((row) =>
		buildStop(
			row,
			teamRows.filter((member) => member.appointment_id === row.appointment_id),
			currentEmployee
		)
	)
	const { today, upcoming, recent } = groupAppointmentsByDay(stops, now)
	const upcomingCount = upcoming.reduce((total, group) => total + group.items.length, 0)
	// Row stagger counts across day groups, so each group needs the number of rows before it.
	const upcomingGroups = upcoming.map((group, groupIndex) => ({
		...group,
		firstRowIndex: upcoming.slice(0, groupIndex).reduce((total, previous) => total + previous.items.length, 0),
	}))

	if (stops.length === 0) {
		return (
			<div className="space-y-6">
				{header}
				<ScheduleEmpty
					icon={CalendarDays}
					title="No appointments yet"
					description="When you're added to a stop it will show up here. Contact admin if you expected to see work here."
				/>
			</div>
		)
	}

	return (
		<div className="animate-in space-y-6 duration-slow ease-out-quart fade-in-0 lg:space-y-8">
			{header}

			<div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
				<section className="space-y-3" aria-label="Today">
					{today.length > 0 ? (
						today.map((stop) => <ScheduleTodayCard key={stop.id} stop={stop} />)
					) : (
						<ScheduleEmpty icon={CalendarCheck} title="No stops today" description="Your next stop is below." />
					)}
				</section>

				<section className="space-y-3">
					<h2 className="text-lg font-semibold tracking-tight">
						Upcoming (<span className="tabular-nums">{upcomingCount}</span>)
					</h2>
					{upcomingGroups.length > 0 ? (
						<div className="space-y-4">
							{upcomingGroups.map((group) => (
								<div key={group.date}>
									<h3 className="sticky top-[calc(3.5rem+var(--safe-top))] z-10 bg-background py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
										{format(parseISO(group.date), DAY_LABEL_FORMAT)}
									</h3>
									<Card className="gap-0 divide-y divide-border p-0 text-sm">
										{group.items.map((stop, itemIndex) => (
											<ScheduleRow key={stop.id} stop={stop} index={group.firstRowIndex + itemIndex} shouldHideIdleClock />
										))}
									</Card>
								</div>
							))}
						</div>
					) : (
						<ScheduleEmpty icon={CalendarDays} title="Nothing after today" description="You're all caught up." />
					)}
				</section>

				<Collapsible className="lg:col-span-2" defaultOpen={false}>
					<h2>
						<CollapsibleTrigger className="group -mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center justify-between rounded-md px-1 text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-muted md:hover:bg-muted">
							<span>
								Recent (<span className="tabular-nums">{recent.length}</span>)
							</span>
							<ChevronDown
								className="size-5 text-muted-foreground transition-transform duration-fast ease-out-quart group-data-panel-open:rotate-180"
								aria-hidden="true"
							/>
						</CollapsibleTrigger>
					</h2>
					<CollapsibleContent className="pt-3 transition-opacity duration-base data-ending-style:opacity-0 data-ending-style:duration-fast data-starting-style:opacity-0">
						{recent.length > 0 ? (
							<ScheduleRows stops={recent} shouldHideIdleClock={false} />
						) : (
							<ScheduleEmpty icon={History} title="No recent stops" description="Stops from the last 7 days will show here." />
						)}
					</CollapsibleContent>
				</Collapsible>
			</div>
		</div>
	)
}
