import { CircleDashed } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import StatusBadge from '@/components/ui/status-badge'
import type { PickerAppointment, TickState } from '@/lib/invoices/appointment-picker'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

import { formatVisitDate } from './visit-line-summary'

const SKELETON_ROW_COUNT = 4

type TickAllProps = {
  state: TickState
  disabled: boolean
  onToggle: () => void
  className?: string
  children: React.ReactNode
}

// A header whose whole row is the tick-all target (44px), so the checkbox itself can stay small.
export function TickAll({ state, disabled, onToggle, className, children }: TickAllProps) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-3 px-4 transition-colors duration-fast active:bg-muted has-[:focus-visible]:bg-muted md:hover:bg-muted',
        className
      )}
    >
      <Checkbox
        checked={state === 'all'}
        indeterminate={state === 'some'}
        disabled={disabled}
        onCheckedChange={onToggle}
        className="size-5"
      />
      {children}
    </label>
  )
}

type PickerRowProps = {
  appointment: PickerAppointment
  isChecked: boolean
  disabled: boolean
  onToggle: (id: string) => void
}

export function PickerRow({ appointment, isChecked, disabled, onToggle }: PickerRowProps) {
  const isUnpriced = appointment.price_cents === null

  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer items-start gap-3 px-4 py-2 transition-colors duration-fast ease-out-quart active:bg-muted has-[:focus-visible]:bg-muted/50 md:hover:bg-muted/50',
        isChecked && 'bg-primary/5 md:hover:bg-primary/5'
      )}
    >
      <Checkbox
        checked={isChecked}
        disabled={disabled}
        onCheckedChange={() => onToggle(appointment.id)}
        className="mt-0.5 size-5"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium break-words text-foreground">
          {formatVisitDate(appointment.scheduled_date)} · {appointment.job_name}
        </span>
        {appointment.location_label ? (
          <span className="block text-sm break-words text-muted-foreground">{appointment.location_label}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold text-foreground tabular-nums">{formatCents(appointment.price_cents ?? 0)}</span>
        {isUnpriced ? (
          <StatusBadge tone="warning" icon={CircleDashed}>
            Unpriced
          </StatusBadge>
        ) : null}
      </span>
    </label>
  )
}

// Stands in for the list while a client's appointments load: a header row, then four rows.
export function PickerSkeleton() {
  return (
    <div>
      <div className="flex min-h-11 items-center gap-3 px-4">
        <Skeleton className="size-5" />
        <Skeleton className="h-4 w-40" />
      </div>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div key={index} className="flex h-16 items-center gap-3 border-t border-border px-4">
          <Skeleton className="size-5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
