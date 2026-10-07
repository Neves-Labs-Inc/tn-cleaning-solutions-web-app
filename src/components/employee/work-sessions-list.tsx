'use client'

import { format, parseISO } from 'date-fns'
import { Calendar, Clock, CheckCircle, Search } from 'lucide-react'
import React from 'react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type TimeSheetRecord = {
  id: string
  clocked_in_at: string | null
  clocked_out_at: string | null
  appointments: {
    scheduled_date: string
    clients: {
      name: string
    }
    jobs: {
      name: string
    }
  }
}

type DurationResult = {
  hours: number
  minutes: number
  totalMinutes: number
  isComplete: boolean
}

function calculateDuration(clockedIn: string | null, clockedOut: string | null): DurationResult {
  if (!clockedIn) {
    return { hours: 0, minutes: 0, totalMinutes: 0, isComplete: false }
  }

  const startedAt = new Date(clockedIn)
  const endedAt = clockedOut ? new Date(clockedOut) : new Date()
  const totalMinutes = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / (1000 * 60)))

  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    totalMinutes,
    isComplete: clockedOut !== null,
  }
}

function formatDuration(hours: number, minutes: number): string {
  if (hours === 0 && minutes === 0) {
    return '0m'
  }

  if (hours === 0) {
    return `${minutes}m`
  }

  if (minutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${minutes}m`
}

function StatusPill({ isComplete }: { isComplete: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-tight',
        isComplete
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      )}
    >
      {isComplete ? <CheckCircle className="size-3.5" aria-hidden="true" /> : <Clock className="size-3.5" aria-hidden="true" />}
      {isComplete ? 'Completed' : 'In progress'}
    </span>
  )
}

export function WorkSessionsList({ records }: { records: TimeSheetRecord[] }) {
  const [searchQuery, setSearchQuery] = React.useState('')
  
  const filteredRecords = React.useMemo(() => {
    if (!searchQuery.trim()) return records
    
    const query = searchQuery.toLowerCase()
    return records.filter((record) => {
      const dateString = format(parseISO(record.appointments.scheduled_date), 'EEE, MMM d, yyyy').toLowerCase()
      const clientName = record.appointments.clients.name.toLowerCase()
      const jobName = record.appointments.jobs.name.toLowerCase()
      
      return dateString.includes(query) || clientName.includes(query) || jobName.includes(query)
    })
  }, [records, searchQuery])

  if (records.length === 0) {
    return (
      <Card className="border-dashed border-emerald-200 bg-white/85 shadow-sm shadow-emerald-950/5">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-950/5">
            <Clock className="size-7" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-neutral-950">No work history yet</h2>
            <p className="max-w-md text-sm leading-6 text-neutral-600">
              Your clocked sessions will appear here once you start and complete appointments this month.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by date, client, or job name..."
          className="w-full rounded-xl border border-emerald-200 bg-white px-10 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-500 hover:text-neutral-700"
          >
            Clear
          </button>
        )}
      </div>

      {filteredRecords.length === 0 ? (
        <Card className="border-dashed border-emerald-200 bg-white/85 shadow-sm shadow-emerald-950/5">
          <CardContent className="py-12 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Search className="size-5" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-neutral-950">No results found</h3>
            <p className="mt-1 text-sm text-neutral-600">Try adjusting your search to find what you&apos;re looking for.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-100 bg-white/95 shadow-sm shadow-emerald-950/5">
          <CardHeader className="border-b border-emerald-50 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-neutral-950">Work Sessions</h2>
                <p className="text-sm text-neutral-500">
                  {searchQuery ? `${filteredRecords.length} of ${records.length} sessions` : 'Filtered to the current month'}
                </p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                {filteredRecords.length} {filteredRecords.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-emerald-50">
              {filteredRecords.map((record) => {
                const { hours, minutes, isComplete } = calculateDuration(record.clocked_in_at, record.clocked_out_at)

                return (
                  <article key={record.id} className="px-4 py-5 transition-colors hover:bg-emerald-50/45 sm:px-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                          <Calendar className="size-4 text-emerald-600" aria-hidden="true" />
                          <span className="font-medium text-neutral-900">
                            {format(parseISO(record.appointments.scheduled_date), 'EEE, MMM d, yyyy')}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold tracking-tight text-neutral-950">{record.appointments.jobs.name}</h3>
                          <p className="text-sm text-neutral-600">{record.appointments.clients.name}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-600">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-neutral-700">Clock in:</span>
                            <span>{record.clocked_in_at ? format(new Date(record.clocked_in_at), 'h:mm a') : '—'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-neutral-700">Clock out:</span>
                            <span>
                              {record.clocked_out_at ? (
                                format(new Date(record.clocked_out_at), 'h:mm a')
                              ) : (
                                <span className="font-medium text-amber-700">Still clocked in</span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-2 lg:items-end lg:text-right">
                        <StatusPill isComplete={isComplete} />
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Duration</p>
                          <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950">{formatDuration(hours, minutes)}</p>
                        </div>
                        <p className="text-xs text-neutral-500">Computed from clock times</p>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
