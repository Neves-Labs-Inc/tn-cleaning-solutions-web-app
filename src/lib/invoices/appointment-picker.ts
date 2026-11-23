import type { LivePrice } from '../pricing/index.ts'

// The pure model behind the appointment picker (a draft's add dialog and the client Billing tab).

export type PickerAppointment = {
  id: string
  scheduled_date: string
  scheduled_start_time: string
  job_name: string
  location_label: string | null
  // The Live price; null when Unpriced. An Unpriced appointment is tickable and joins as a $0 line.
  price_cents: number | null
}

export type PickerMonth = {
  key: string
  label: string
  rows: PickerAppointment[]
  count: number
  totalCents: number
}

export type TickState = 'all' | 'some' | 'none'

type ClaimableFacts = {
  id: string
  status: string
  scheduled_date: string
  scheduled_start_time: string
  job_name: string
  location_label: string | null
  live: LivePrice
}

const monthFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const MONTH_KEY_LENGTH = 'YYYY-MM'.length

function byDateThenTime(a: PickerAppointment, b: PickerAppointment): number {
  return a.scheduled_date.localeCompare(b.scheduled_date) || a.scheduled_start_time.localeCompare(b.scheduled_start_time)
}

function toPickerAppointment(visit: ClaimableFacts): PickerAppointment {
  return {
    id: visit.id,
    scheduled_date: visit.scheduled_date,
    scheduled_start_time: visit.scheduled_start_time,
    job_name: visit.job_name,
    location_label: visit.location_label,
    price_cents: visit.live.source === 'unpriced' ? null : visit.live.amount_cents,
  }
}

// One query feeds both groups: completed is Unbilled; anything else still open is Upcoming, even
// when its date has passed.
export function splitClaimable(visits: ClaimableFacts[]): { unbilled: PickerAppointment[]; upcoming: PickerAppointment[] } {
  const rows = visits.map((visit) => ({ row: toPickerAppointment(visit), isCompleted: visit.status === 'completed' }))
  return {
    unbilled: rows.filter((entry) => entry.isCompleted).map((entry) => entry.row),
    upcoming: rows.filter((entry) => !entry.isCompleted).map((entry) => entry.row),
  }
}

export function groupByMonth(appointments: PickerAppointment[]): PickerMonth[] {
  const months = new Map<string, PickerAppointment[]>()
  for (const appointment of [...appointments].sort(byDateThenTime)) {
    const key = appointment.scheduled_date.slice(0, MONTH_KEY_LENGTH)
    months.set(key, [...(months.get(key) ?? []), appointment])
  }

  return [...months].map(([key, rows]) => ({
    key,
    label: monthFormatter.format(new Date(`${key}-01T00:00:00Z`)),
    rows,
    count: rows.length,
    totalCents: rows.reduce((total, row) => total + (row.price_cents ?? 0), 0),
  }))
}

export function tickState(ids: string[], selected: ReadonlySet<string>): TickState {
  const ticked = ids.filter((id) => selected.has(id)).length
  if (ticked === 0) return 'none'
  return ticked === ids.length ? 'all' : 'some'
}

export function selectionSummary(
  selected: ReadonlySet<string>,
  appointments: PickerAppointment[]
): { count: number; totalCents: number } {
  const chosen = appointments.filter((appointment) => selected.has(appointment.id))
  return { count: chosen.length, totalCents: chosen.reduce((total, row) => total + (row.price_cents ?? 0), 0) }
}

// `?pick=id,id`: ids the picker doesn't list are dropped, so a stale link ticks nothing.
export function parsePick(param: string | null | undefined, availableIds: Iterable<string>): string[] {
  if (!param) return []

  const available = new Set(availableIds)
  const picked = param.split(',').map((id) => id.trim())
  return [...new Set(picked.filter((id) => available.has(id)))]
}

export function isUpcomingOpenInitially(selected: Iterable<string>, upcoming: PickerAppointment[]): boolean {
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id))
  return [...selected].some((id) => upcomingIds.has(id))
}
