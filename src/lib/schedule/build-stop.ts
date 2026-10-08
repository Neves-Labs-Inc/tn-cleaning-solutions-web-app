import type { CrewMember, ScheduleStop } from '../../types/schedule.ts'
import { getClockStatus } from './clock-status.ts'

export type AppointmentRecord = {
  id: string
  appointment_id: string
  clocked_in_at: string | null
  clocked_out_at: string | null
  appointments: {
    id: string
    scheduled_date: string
    scheduled_start_time: string
    scheduled_end_time: string
    status: ScheduleStop['status']
    clients: { name: string; phone: string | null }
    client_locations: { label: string; address: string } | null
    jobs: { name: string; description: string | null }
  }
}

export type TeamMemberRecord = {
  appointment_id: string
  clocked_in_at: string | null
  clocked_out_at: string | null
  employees_employee_view: { id: string; full_name: string; phone: string | null }
}

export type EmployeeSummary = { id: string; full_name: string; phone: string | null }

function toCrewMember(
  employee: EmployeeSummary,
  clockedInAt: string | null,
  clockedOutAt: string | null
): CrewMember {
  return {
    id: employee.id,
    full_name: employee.full_name,
    phone: employee.phone,
    clocked_in_at: clockedInAt,
    clocked_out_at: clockedOutAt,
    clockStatus: getClockStatus(clockedInAt, clockedOutAt),
  }
}

export function buildStop(
  row: AppointmentRecord,
  teamRows: TeamMemberRecord[],
  currentEmployee: EmployeeSummary
): ScheduleStop {
  const { appointments: appointment } = row
  const teamCrew = teamRows.map((member) =>
    toCrewMember(member.employees_employee_view, member.clocked_in_at, member.clocked_out_at)
  )
  // The team view can omit the signed-in Cleaner, so fall back to their own assignment row.
  const you =
    teamCrew.find((member) => member.id === currentEmployee.id) ??
    toCrewMember(currentEmployee, row.clocked_in_at, row.clocked_out_at)
  const others = teamCrew
    .filter((member) => member.id !== currentEmployee.id)
    .sort((left, right) => left.full_name.localeCompare(right.full_name))

  return {
    id: appointment.id,
    assignmentId: row.id,
    scheduled_date: appointment.scheduled_date,
    scheduled_start_time: appointment.scheduled_start_time,
    scheduled_end_time: appointment.scheduled_end_time,
    status: appointment.status,
    jobName: appointment.jobs.name,
    jobDescription: appointment.jobs.description,
    clientName: appointment.clients.name,
    clientPhone: appointment.clients.phone,
    address: appointment.client_locations?.address ?? null,
    crew: [you, ...others],
    you,
  }
}
