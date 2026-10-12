import type { AppointmentStatus } from './lifecycle.ts'

// The appointments screen's Client, Job and Status filters. Independent of the date range the
// screen shows, so a new range model only has to spread these in. Pure, like overview.ts.

export const APPOINTMENT_STATUS_FILTERS = [
  'all',
  'scheduled',
  'not_clocked',
  'in_progress',
  'missed_clock',
  'completed',
  'cancelled',
] as const

export type AppointmentStatusFilter = (typeof APPOINTMENT_STATUS_FILTERS)[number]

// An empty id means All.
export type AppointmentsFilter = {
  clientId: string
  jobId: string
  status: AppointmentStatusFilter
}

export type FilterOption = { id: string; name: string }

export type FilterOptions = { clients: FilterOption[]; jobs: FilterOption[] }

export type FilterableAppointment = {
  clientId: string
  jobId: string
  status: AppointmentStatus
  isNotClocked: boolean
  isMissedClock: boolean
}

type SearchParam = string | string[] | undefined

export type AppointmentsFilterParams = {
  client?: SearchParam
  job?: SearchParam
  status?: SearchParam
}

export const ALL_APPOINTMENTS_FILTER: AppointmentsFilter = { clientId: '', jobId: '', status: 'all' }

// A repeated param is ambiguous, so it counts as absent.
function single(value: SearchParam): string {
  return typeof value === 'string' ? value : ''
}

function parseStatus(value: string): AppointmentStatusFilter {
  return APPOINTMENT_STATUS_FILTERS.find((status) => status === value) ?? 'all'
}

export function parseAppointmentsFilter(params: AppointmentsFilterParams): AppointmentsFilter {
  return {
    clientId: single(params.client),
    jobId: single(params.job),
    status: parseStatus(single(params.status)),
  }
}

// The URL params a filter adds, in order; defaults are left out so an unfiltered URL stays clean.
export function appointmentsFilterEntries(filter: AppointmentsFilter): Array<[string, string]> {
  const entries: Array<[string, string]> = [
    ['client', filter.clientId],
    ['job', filter.jobId],
    ['status', filter.status === 'all' ? '' : filter.status],
  ]
  return entries.filter(([, value]) => value !== '')
}

export function isAppointmentsFilterActive(filter: AppointmentsFilter): boolean {
  return appointmentsFilterEntries(filter).length > 0
}

// An id the selects can't show reads as All, so the list is never narrowed by a hidden value.
export function resolveFilterOptions<T extends AppointmentsFilter>(filter: T, options: FilterOptions): T {
  const isKnownClient = options.clients.some((client) => client.id === filter.clientId)
  const isKnownJob = options.jobs.some((job) => job.id === filter.jobId)
  return {
    ...filter,
    clientId: isKnownClient ? filter.clientId : '',
    jobId: isKnownJob ? filter.jobId : '',
  }
}

// Matched on the status a row shows: Not clocked stands in for Scheduled, and Missed clock for In progress,
// once the grace has passed.
function matchesStatus(appointment: FilterableAppointment, status: AppointmentStatusFilter): boolean {
  if (status === 'all') return true
  if (status === 'not_clocked') return appointment.isNotClocked
  if (status === 'scheduled') return appointment.status === 'scheduled' && !appointment.isNotClocked

  if (status === 'missed_clock') return appointment.isMissedClock
  if (status === 'in_progress') return appointment.status === 'in_progress' && !appointment.isMissedClock

  return appointment.status === status
}

// All keeps today's rule (cancelled only with Show cancelled); any other status already decides
// whether cancelled rows show.
export function matchesFilters(
  appointment: FilterableAppointment,
  filter: AppointmentsFilter,
  showCancelled: boolean
): boolean {
  const isCancelledHidden = filter.status === 'all' && !showCancelled && appointment.status === 'cancelled'
  return (
    !isCancelledHidden &&
    (filter.clientId === '' || appointment.clientId === filter.clientId) &&
    (filter.jobId === '' || appointment.jobId === filter.jobId) &&
    matchesStatus(appointment, filter.status)
  )
}

// Needs billing and Needs completion rows all share one status, so only Client and Job narrow
// them; a leftover status param is ignored.
export function filterNeedsRows<T extends { clientId: string; jobId: string }>(
  rows: T[],
  filter: AppointmentsFilter
): T[] {
  const clientAndJob: AppointmentsFilter = { ...filter, status: 'all' }
  return rows.filter((row) =>
    matchesFilters({ clientId: row.clientId, jobId: row.jobId, status: 'completed', isNotClocked: false, isMissedClock: false }, clientAndJob, true)
  )
}
