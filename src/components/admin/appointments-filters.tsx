'use client'

import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  isAppointmentsFilterActive,
  type AppointmentsFilter,
  type AppointmentStatusFilter,
  type FilterOption,
} from '@/lib/appointments/filters'
import { cn } from '@/lib/utils'

type AppointmentsFiltersProps = {
  filter: AppointmentsFilter
  clients: FilterOption[]
  jobs: FilterOption[]
  // The parent moves focus here after a clear, from whichever Clear button was pressed.
  clientTriggerId: string
  // Off where every row has one status (Needs billing, Needs completion).
  showStatus?: boolean
  onChange: (patch: Partial<AppointmentsFilter>) => void
  onClear: () => void
}

const STATUS_OPTIONS: Array<{ value: AppointmentStatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'not_clocked', label: 'Not clocked' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'missed_clock', label: 'Missed clock' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

// The primitive's select has no pointer or hover border of its own; the class lands on its wrapper.
const SELECT_CLASS = '[&>select]:cursor-pointer md:[&>select:hover]:border-foreground/30'
const PRESS_CLASS = 'transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]'

function byName(a: FilterOption, b: FilterOption): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

function isStatusFilter(value: string): value is AppointmentStatusFilter {
  return STATUS_OPTIONS.some((option) => option.value === value)
}

// Renders and calls back; the parent turns each change into a navigation.
export default function AppointmentsFilters({
  filter,
  clients,
  jobs,
  clientTriggerId,
  showStatus = true,
  onChange,
  onClear,
}: AppointmentsFiltersProps): React.ReactNode {
  const isFiltered = isAppointmentsFilterActive(filter)

  const clientOptions = [
    { value: '', label: 'All clients' },
    ...[...clients].sort(byName).map((client) => ({ value: client.id, label: client.name })),
  ]
  const sortedJobs = [...jobs].sort(byName)

  return (
    <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
      <div className="col-span-2 min-w-0 md:w-72">
        <SearchableSelect
          id={clientTriggerId}
          options={clientOptions}
          value={filter.clientId}
          onValueChange={(clientId) => onChange({ clientId })}
          placeholder="All clients"
          searchPlaceholder="Search clients…"
          emptyMessage="No clients found."
          aria-label="Client"
        />
      </div>
      <NativeSelect
        aria-label="Job"
        className={cn('w-full md:w-56', SELECT_CLASS, !showStatus && 'col-span-2')}
        value={filter.jobId}
        onChange={(event) => onChange({ jobId: event.target.value })}
      >
        <NativeSelectOption value="">All jobs</NativeSelectOption>
        {sortedJobs.map((job) => (
          <NativeSelectOption key={job.id} value={job.id}>
            {job.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {showStatus ? (
        <NativeSelect
          aria-label="Status"
          className={cn('w-full md:w-44', SELECT_CLASS)}
          value={filter.status}
          onChange={(event) => {
            const { value } = event.target
            if (isStatusFilter(value)) onChange({ status: value })
          }}
        >
          {STATUS_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : null}
      {isFiltered ? (
        <Button
          type="button"
          variant="ghost"
          className={cn(
            'col-span-2 justify-self-end animate-in fade-in-0 ease-out-quart active:bg-muted',
            PRESS_CLASS
          )}
          onClick={onClear}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
