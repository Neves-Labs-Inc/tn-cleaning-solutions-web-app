'use client'

import { format, parseISO } from 'date-fns'
import { CheckCircle2, Clock, Clock3, Search, SearchX, X } from 'lucide-react'
import React from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import StatusBadge from '@/components/ui/status-badge'
import { calculateDuration, formatBusinessTime, formatDuration } from '@/lib/schedule'
import type { TimeSheetRecord } from '@/types/time-sheet-record'

const DATE_FORMAT = 'EEE, MMM d, yyyy'
const MAX_ANIMATED_ROWS = 8
const ROW_STAGGER_MS = 40

type WorkSessionsListProps = {
  records: TimeSheetRecord[]
  monthLabel: string
  now: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
}

export function WorkSessionsList({ records, monthLabel, now, emptyDescription, emptyAction }: WorkSessionsListProps) {
  const [searchQuery, setSearchQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const nowDate = React.useMemo(() => new Date(now), [now])

  const filteredRecords = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return records

    return records.filter((record) => {
      const dateString = format(parseISO(record.appointments.scheduled_date), DATE_FORMAT).toLowerCase()
      const clientName = record.appointments.clients.name.toLowerCase()
      const jobName = record.appointments.jobs.name.toLowerCase()

      return dateString.includes(query) || clientName.includes(query) || jobName.includes(query)
    })
  }, [records, searchQuery])

  function handleClearSearch() {
    setSearchQuery('')
    inputRef.current?.focus()
  }

  if (records.length === 0) {
    return (
      <Card className="p-0">
        <Empty className="rounded-xl py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock3 aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle className="text-base">No sessions in {monthLabel}</EmptyTitle>
            {emptyDescription ? <EmptyDescription className="text-sm">{emptyDescription}</EmptyDescription> : null}
          </EmptyHeader>
          {emptyAction ? <EmptyContent>{emptyAction}</EmptyContent> : null}
        </Empty>
      </Card>
    )
  }

  const isSearching = searchQuery.trim() !== ''
  const countLabel = isSearching
    ? `${filteredRecords.length} of ${records.length} ${records.length === 1 ? 'session' : 'sessions'}`
    : `${filteredRecords.length} ${filteredRecords.length === 1 ? 'entry' : 'entries'}`

  return (
    <div className="space-y-4">
      <InputGroup className="transition-[border-color,box-shadow] duration-fast hover:border-foreground/30">
        <InputGroupAddon align="inline-start">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Search sessions"
          placeholder="Search by date, client, or job"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        {searchQuery ? (
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              onClick={handleClearSearch}
              className="animate-in fade-in-0 zoom-in-95 duration-fast active:bg-muted active:scale-[0.98]"
            >
              <X aria-hidden="true" />
            </Button>
          </InputGroupAddon>
        ) : null}
      </InputGroup>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Work sessions</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{countLabel}</span>
      </div>

      {filteredRecords.length === 0 ? (
        <Card className="p-0">
          <Empty className="rounded-xl py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchX aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle className="text-base">No matches</EmptyTitle>
              <EmptyDescription className="text-sm">Try a different date, client, or job.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={handleClearSearch}>
                Clear search
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      ) : (
        <Card className="gap-0 p-0 py-0">
          <ul className="divide-y divide-border">
            {filteredRecords.map((record, index) => {
              const { hours, minutes, isComplete } = calculateDuration(record.clocked_in_at, record.clocked_out_at, nowDate)
              const shouldAnimate = index < MAX_ANIMATED_ROWS

              return (
                <li
                  key={record.id}
                  className={`grid min-h-16 min-w-0 grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3${
                    shouldAnimate ? ' animate-in fade-in-0 slide-in-from-bottom-1 duration-base' : ''
                  }`}
                  style={shouldAnimate ? { animationDelay: `${index * ROW_STAGGER_MS}ms` } : undefined}
                >
                  <p className="text-sm font-medium text-foreground">
                    {format(parseISO(record.appointments.scheduled_date), DATE_FORMAT)}
                  </p>
                  <div className="row-span-4 flex flex-col items-end justify-self-end text-right">
                    <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                      {formatDuration(hours, minutes)}
                    </span>
                    {isComplete ? (
                      <StatusBadge tone="success" icon={CheckCircle2} className="mt-1">
                        Completed
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning" icon={Clock} className="mt-1">
                        In progress
                      </StatusBadge>
                    )}
                  </div>
                  <h3 className="min-w-0 text-base font-semibold wrap-break-word text-foreground">{record.appointments.jobs.name}</h3>
                  <p className="min-w-0 text-sm wrap-break-word text-muted-foreground">{record.appointments.clients.name}</p>
                  <p className="font-mono text-sm tabular-nums text-muted-foreground">
                    <span className="whitespace-nowrap">
                      In {record.clocked_in_at ? formatBusinessTime(new Date(record.clocked_in_at)) : '—'}
                    </span>{' '}
                    ·{' '}
                    <span className="whitespace-nowrap">
                      Out{' '}
                      {record.clocked_out_at ? (
                        formatBusinessTime(new Date(record.clocked_out_at))
                      ) : (
                        <span className="font-sans font-medium text-status-warning-foreground">Still clocked in</span>
                      )}
                    </span>
                  </p>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
