// Plain .ts so node:test can load it.
import type { ScheduleAppointment } from '../../lib/appointments/overview.ts'
import { appointmentStatusBadge, paymentStateBadge } from '../ui/status-badge-tones.ts'

// A calendar event's hover title: "09:00 Deep clean · Smith Residence · Completed", plus the
// Payment state and invoice number ("Draft" before it has one) when the appointment has a claim.
export function calendarEventTitle(appointment: ScheduleAppointment): string {
  const parts = [
    `${appointment.startTime.slice(0, 5)} ${appointment.jobName}`,
    appointment.clientName,
    appointmentStatusBadge(appointment.status).label,
  ]
  if (appointment.claim && appointment.paymentState) {
    parts.push(paymentStateBadge(appointment.paymentState).label, appointment.claim.number ?? 'Draft')
  }
  return parts.join(' · ')
}
