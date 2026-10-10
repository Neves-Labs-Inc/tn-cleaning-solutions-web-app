'use client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { claimableStates, groupVisitsByDate } from '@/lib/invoices/lines'
import type { ClaimableVisit } from '@/lib/invoices/queries'
import { cn } from '@/lib/utils'

import { SetPriceLink, VisitLineSummary } from './visit-line-summary'

const MAX_STAGGERED_ROWS = 8
const STAGGER_MS = 40
const SKELETON_ROW_COUNT = 4

type ClaimableVisitListProps = {
  visits: ClaimableVisit[]
  selected: ReadonlySet<string>
  onSelectedChange: (next: Set<string>) => void
  businessDate: string
  disabled?: boolean
  // A client switch is loading: the count reads "—" and the rows are placeholders.
  isLoading?: boolean
  // Inside a ResponsiveDialog the list scrolls in the sheet, so group headers stick to its top.
  isInSheet?: boolean
}

type VisitRowProps = {
  visit: ClaimableVisit
  index: number
  isChecked: boolean
  isDisabled: boolean
  onToggle: (id: string) => void
}

function VisitRow({ visit, index, isChecked, isDisabled, onToggle }: VisitRowProps) {
  const states = claimableStates(visit)

  return (
    <li
      className="flex flex-col animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart"
      style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS - 1) * STAGGER_MS}ms` }}
    >
      <label className="flex min-h-16 cursor-pointer items-start gap-3 px-4 py-3 transition-colors duration-fast active:bg-muted has-[:focus-visible]:bg-muted/50 md:hover:bg-muted/50">
        <Checkbox
          className="mt-1 scroll-mb-40 md:scroll-mb-0"
          checked={isChecked}
          disabled={isDisabled}
          onCheckedChange={() => onToggle(visit.id)}
        />
        <VisitLineSummary
          date={visit.scheduled_date}
          startTime={visit.scheduled_start_time}
          endTime={visit.scheduled_end_time}
          jobName={visit.job_name}
          locationLabel={visit.location_label}
          states={states}
          amountCents={visit.amount_cents}
          appointmentId={visit.id}
          setPriceLink="none"
        />
      </label>
      {states.includes('unpriced') ? (
        <SetPriceLink
          appointmentId={visit.id}
          jobName={visit.job_name}
          date={visit.scheduled_date}
          className="mr-4 -mt-2 mb-1 ml-auto scroll-mb-40 md:scroll-mb-0"
        />
      ) : null}
    </li>
  )
}

function GroupHeader({ children, isInSheet }: { children: string; isInSheet: boolean }) {
  return (
    <li
      className={cn(
        'sticky z-10 bg-card px-4 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase first:rounded-t-lg',
        isInSheet ? 'top-0' : 'top-16 lg:top-0'
      )}
    >
      {children}
    </li>
  )
}

function SkeletonRows() {
  return Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
    <li key={index} className="flex h-16 items-center gap-3 px-4">
      <Skeleton className="size-4" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-16" />
    </li>
  ))
}

// The checkbox list of a client's claimable visits. Controlled and fetch-free: the page that owns the
// selection decides what the checks mean (a new draft, or visits to add to one).
export function ClaimableVisitList({
  visits,
  selected,
  onSelectedChange,
  businessDate,
  disabled = false,
  isLoading = false,
  isInSheet = false,
}: ClaimableVisitListProps) {
  const groups = groupVisitsByDate(visits, businessDate)
  const isAllSelected = visits.length > 0 && visits.every((visit) => selected.has(visit.id))

  function handleToggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onSelectedChange(next)
  }

  function handleToggleAll() {
    onSelectedChange(isAllSelected ? new Set() : new Set(visits.map((visit) => visit.id)))
  }

  function renderGroup(title: string, group: ClaimableVisit[], firstIndex: number) {
    if (group.length === 0) return null

    return (
      <>
        <GroupHeader isInSheet={isInSheet}>{title}</GroupHeader>
        {group.map((visit, offset) => (
          <VisitRow
            key={visit.id}
            visit={visit}
            index={firstIndex + offset}
            isChecked={selected.has(visit.id)}
            isDisabled={disabled}
            onToggle={handleToggle}
          />
        ))}
      </>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Visits</h2>
          <p className="min-w-[3ch] text-sm text-muted-foreground tabular-nums">
            {isLoading ? '—' : `${selected.size} of ${visits.length} selected`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="cursor-pointer transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] active:bg-muted"
          disabled={disabled || isLoading || visits.length === 0}
          onClick={handleToggleAll}
        >
          {isAllSelected ? 'Clear' : 'Select all'}
        </Button>
      </div>

      <Card
        className={cn('animate-in fade-in-0 gap-0 overflow-visible p-0 duration-slow')}
        aria-busy={isLoading}
      >
        <ul className="divide-y divide-border">
          {isLoading ? (
            <SkeletonRows />
          ) : (
            <>
              {renderGroup('Past and today', groups.past, 0)}
              {renderGroup('Upcoming', groups.upcoming, groups.past.length)}
            </>
          )}
        </ul>
      </Card>
    </section>
  )
}
