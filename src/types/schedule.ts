import type { AppointmentStatus } from '@/lib/helpers/dashboard'
import type { ClockStatus } from '@/lib/schedule'

export type CrewMember = {
	id: string
	full_name: string
	phone: string | null
	clocked_in_at: string | null
	clocked_out_at: string | null
	clockStatus: ClockStatus
}

// One appointment the signed-in Cleaner is assigned to, flattened for the schedule screens.
export type ScheduleStop = {
	id: string
	assignmentId: string
	scheduled_date: string
	scheduled_start_time: string
	scheduled_end_time: string
	status: AppointmentStatus
	jobName: string
	jobDescription: string | null
	clientName: string
	clientPhone: string | null
	address: string | null
	crew: CrewMember[]
	you: CrewMember
}
