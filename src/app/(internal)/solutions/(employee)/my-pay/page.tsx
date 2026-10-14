import { Wallet } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'

import { PaidRunCard } from '@/components/employee/paid-run-card'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import PageHeader from '@/components/ui/page-header'
import StatTile from '@/components/ui/stat-tile'
import { buildMyPay, formatPayPeriodRange, type MyPayYearGroup } from '@/lib/payroll/my-pay'
import { getPayPeriod } from '@/lib/payroll/period'
import { fetchMyPaidRuns } from '@/lib/payroll/queries'
import { formatDuration, getBusinessDate } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'
import { fetchCleanerSessions } from '@/lib/time-sheets/queries'
import { summarizeCleanerMonth } from '@/lib/time-sheets/summaries'

const MINUTES_PER_HOUR = 60
const MAX_ANIMATED_RUNS = 8
const RUN_STAGGER_MS = 40

function formatMinutes(totalMinutes: number): string {
  return formatDuration(Math.floor(totalMinutes / MINUTES_PER_HOUR), totalMinutes % MINUTES_PER_HOUR)
}

function PaidRunsEmpty(): React.ReactNode {
  return (
    <Card className="p-0">
      <Empty className="rounded-xl py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wallet aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="text-base">No paid Pay runs yet</EmptyTitle>
          <EmptyDescription className="text-sm">Each Pay run shows here once it&apos;s paid.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </Card>
  )
}

function PaidRunsList({ groups, runCount }: { groups: MyPayYearGroup[]; runCount: number }): React.ReactNode {
  // Where each year group starts in the whole list, so the stagger and the open run span groups.
  const groupOffsets = groups.map((_, groupIndex) =>
    groups.slice(0, groupIndex).reduce((total, group) => total + group.runs.length, 0),
  )

  return (
    <section className="space-y-3" aria-labelledby="paid-runs-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="paid-runs-title" className="text-lg font-semibold tracking-tight">
          Paid runs
        </h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {runCount} {runCount === 1 ? 'run' : 'runs'}
        </span>
      </div>
      {groups.map((group, groupIndex) => (
        <div key={group.yearLabel ?? 'all'}>
          {group.yearLabel ? (
            <h3 className="sticky top-14 z-10 bg-background py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {group.yearLabel}
            </h3>
          ) : null}
          <ul className="flex flex-col gap-3">
            {group.runs.map((run, runIndex) => {
              const index = groupOffsets[groupIndex] + runIndex
              const shouldAnimate = index < MAX_ANIMATED_RUNS

              return (
                <li
                  key={run.id}
                  className={shouldAnimate ? 'animate-in fade-in-0 slide-in-from-bottom-1 duration-base' : undefined}
                  style={shouldAnimate ? { animationDelay: `${index * RUN_STAGGER_MS}ms` } : undefined}
                >
                  {/* The newest run starts open. */}
                  <PaidRunCard run={run} defaultOpen={index === 0} />
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}

export default async function MyPayPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: employee } = await supabase.from('employees').select('id').eq('user_id', user.id).single<{ id: string }>()

  if (!employee) {
    notFound()
  }

  const period = getPayPeriod(getBusinessDate(new Date()))
  // Both reads throw on failure, so error.tsx renders.
  const [periodRecords, paidRuns] = await Promise.all([
    fetchCleanerSessions(supabase, employee.id, period),
    fetchMyPaidRuns(supabase),
  ])

  const { totalMinutes: periodMinutes } = summarizeCleanerMonth(periodRecords)
  const { groups, lastRun } = buildMyPay(paidRuns)
  const runCount = groups.reduce((total, group) => total + group.runs.length, 0)

  return (
    <div className="animate-in space-y-6 fade-in-0 duration-slow">
      <PageHeader title="My pay" description="Pay shows here once a run is paid." />

      {/* Hours only: money shows only inside a paid run. */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="This Pay period" value={formatMinutes(periodMinutes)} caption={formatPayPeriodRange(period.start)} />
        <StatTile
          label="Last paid run"
          value={lastRun ? formatMinutes(lastRun.minutes) : '—'}
          caption={lastRun ? lastRun.periodLabel : 'None yet'}
        />
      </div>

      {runCount === 0 ? <PaidRunsEmpty /> : <PaidRunsList groups={groups} runCount={runCount} />}
    </div>
  )
}
