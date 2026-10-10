import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { WorkSessionsList } from '@/components/employee/work-sessions-list'
import { Button, buttonVariants } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import StatTile from '@/components/ui/stat-tile'
import { formatDuration, toBusinessWallClock } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import { fetchCleanerSessions } from '@/lib/time-sheets/queries'
import { summarizeCleanerMonth } from '@/lib/time-sheets/summaries'
import { resolveTimeSheetMonth } from '@/lib/time-sheets/time-sheet-month'
import { cn } from '@/lib/utils'
import type { TimeSheetRecord } from '@/types/time-sheet-record'

const MINUTES_PER_HOUR = 60

type EmployeeRecord = {
  id: string
  full_name: string
}

type TimeSheetsPageProps = {
  searchParams: Promise<{ month?: string | string[] }>
}

function compareRecords(left: TimeSheetRecord, right: TimeSheetRecord) {
  // clocked_in_at is a full timestamp; fall back to the date for rows without one.
  const leftDate = new Date(left.clocked_in_at ?? left.appointments.scheduled_date)
  const rightDate = new Date(right.clocked_in_at ?? right.appointments.scheduled_date)

  return rightDate.getTime() - leftDate.getTime()
}

function formatMinutes(totalMinutes: number): string {
  return formatDuration(Math.floor(totalMinutes / MINUTES_PER_HOUR), totalMinutes % MINUTES_PER_HOUR)
}

function MonthStepper({ label, prevParam, nextParam }: { label: string; prevParam: string; nextParam: string | null }) {
  const chevronClasses = 'active:bg-muted active:scale-[0.98] duration-fast'

  return (
    <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start sm:gap-1">
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        aria-label="Previous month"
        className={chevronClasses}
        render={<Link href={`?month=${prevParam}`} />}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="min-w-0 text-center text-sm font-medium whitespace-nowrap text-foreground tabular-nums">{label}</span>
      {nextParam ? (
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          aria-label="Next month"
          className={chevronClasses}
          render={<Link href={`?month=${nextParam}`} />}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      ) : (
        <span
          aria-label="Next month"
          aria-disabled="true"
          role="button"
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'pointer-events-none cursor-default text-muted-foreground/50')}
        >
          <ChevronRight aria-hidden="true" />
        </span>
      )}
    </div>
  )
}

export default async function TimeSheetsPage({ searchParams }: TimeSheetsPageProps) {
  const { month } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: employee } = await supabase.from('employees').select('id, full_name').eq('user_id', user.id).single<EmployeeRecord>()

  if (!employee) {
    notFound()
  }

  // Durations use the real instant; only the month boundary follows business time.
  const now = new Date()
  const selectedMonth = resolveTimeSheetMonth(month, toBusinessWallClock(now))

  const records = [...(await fetchCleanerSessions(supabase, employee.id, selectedMonth))].sort(compareRecords)

  const { count, totalMinutes, averageMinutes } = summarizeCleanerMonth(records)

  return (
    <div className="animate-in space-y-6 fade-in-0 duration-slow">
      <PageHeader
        title="Time Sheets"
        className="sm:items-center"
        action={<MonthStepper label={selectedMonth.label} prevParam={selectedMonth.prevParam} nextParam={selectedMonth.nextParam} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Appointments" value={String(count)} />
        <StatTile label="Total Hours" value={formatMinutes(totalMinutes)} />
        <StatTile label="Avg per Job" value={averageMinutes === null ? '—' : formatMinutes(averageMinutes)} className="col-span-2 sm:col-span-1" />
      </div>

      <WorkSessionsList records={records} monthLabel={selectedMonth.label} now={now.toISOString()}
        emptyDescription="Clock in on an appointment and it will appear here."
        emptyAction={
          <Button variant="outline" nativeButton={false} render={<Link href="/solutions/schedule" />}>
            Go to Schedule
          </Button>
        }
      />
    </div>
  )
}
