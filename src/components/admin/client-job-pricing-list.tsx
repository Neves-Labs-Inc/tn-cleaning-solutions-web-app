'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Pencil, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useInvalidateAppointments } from '@/hooks/use-invalidate-appointments'
import { archiveClientJobPricing, restoreClientJobPricing } from '@/lib/actions/client-job-pricing'
import { formatRate } from '@/lib/pricing/money'

export type ClientJobPricingRow = {
  id: string
  job_id: string
  job_name: string
  hourly_rate_cents: number
  effective_from: string
  notes: string | null
  is_archived: boolean
}

export type ClientJobPricingListProps = {
  clientId: string
  rows: ClientJobPricingRow[]
  today: string
}

type RuleStatus = 'Current' | 'Scheduled' | 'Superseded' | 'Archived'

type RuleEntry = {
  row: ClientJobPricingRow
  status: RuleStatus
}

type JobGroup = {
  jobId: string
  jobName: string
  entries: RuleEntry[]
}

const chipBase = 'shrink-0 rounded-full border px-2 py-1 text-xs font-medium'

const statusClassNames: Record<RuleStatus, string> = {
  Current: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  Scheduled: 'border-neutral-200 bg-neutral-100 text-neutral-700',
  Superseded: 'border-neutral-200 bg-white text-neutral-500',
  Archived: 'border-neutral-200 bg-neutral-100 text-neutral-500',
}

export function ClientJobPricingList({ clientId, rows, today }: ClientJobPricingListProps) {
  const groups = groupByJob(rows, today)
  const archivedEntries = groups.flatMap((group) => group.entries.filter((entry) => entry.row.is_archived))
  const activeGroups = groups
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => !entry.row.is_archived) }))
    .filter((group) => group.entries.length > 0)

  return (
    <>
      {activeGroups.length > 0 ? (
        <div className="space-y-6">
          {activeGroups.map((group) => (
            <section key={group.jobId} className="space-y-3">
              <h2 className="text-base font-semibold text-neutral-950">{group.jobName}</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {group.entries.map((entry) => (
                  <RuleCard key={entry.row.id} entry={entry} clientId={clientId} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl border border-emerald-100 bg-white px-4 py-8 text-center text-sm leading-6 text-neutral-600 shadow-sm shadow-emerald-950/5">
          No custom pricing for this client — appointments bill each job&apos;s standard hourly rate.
        </section>
      )}

      {archivedEntries.length > 0 ? (
        <section>
          <details className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-emerald-950/5">
            <summary className="cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-500">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-neutral-950">Archived Rates</h2>
                <span className="rounded-full border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600">
                  {archivedEntries.length}
                </span>
              </div>
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {archivedEntries.map((entry) => (
                <RuleCard key={entry.row.id} entry={entry} clientId={clientId} />
              ))}
            </div>
          </details>
        </section>
      ) : null}
    </>
  )
}

function RuleCard({ entry, clientId }: { entry: RuleEntry; clientId: string }) {
  const { row, status } = entry

  const invalidateAppointments = useInvalidateAppointments()
  const [errorMessage, formAction] = useActionState(handleStateChange, '')

  async function handleStateChange(_previous: string, formData: FormData) {
    const pricingId = String(formData.get('pricingId') ?? '')
    let message = ''

    if (pricingId) {
      const result = row.is_archived
        ? await restoreClientJobPricing(pricingId)
        : await archiveClientJobPricing(pricingId)

      if (result.success) {
        // Cached prices come from the rate in force, so they are stale now.
        void invalidateAppointments()
      } else {
        message = result.error
      }
    }

    return message
  }

  return (
    <Card
      className={`rounded-2xl border border-neutral-200 py-0 shadow-sm shadow-emerald-950/5 ${
        row.is_archived ? 'bg-neutral-50' : 'bg-white'
      }`}
    >
      <CardHeader className="gap-2 border-b border-neutral-100 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle
              className={`truncate text-base font-semibold ${row.is_archived ? 'text-neutral-500' : 'text-neutral-950'}`}
            >
              {formatRate(row.hourly_rate_cents)}
            </CardTitle>
            <p className="mt-1 text-xs text-neutral-500">
              {row.is_archived ? `${row.job_name} · ` : ''}From {row.effective_from}
            </p>
          </div>
          <span className={`${chipBase} ${statusClassNames[status]}`}>{status}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-5 py-4">
        <p className="text-sm leading-6 text-neutral-600">{row.notes || 'No notes added.'}</p>
        {errorMessage ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            {errorMessage}
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="justify-between border-t border-neutral-100 px-5 py-3">
        <Link
          href={`/solutions/clients/${clientId}/pricing/${row.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </Link>

        <form action={formAction}>
          <input type="hidden" name="pricingId" value={row.id} />
          <Button
            type="submit"
            variant="outline"
            className={`h-8 cursor-pointer rounded-full px-3 text-xs font-medium ${
              row.is_archived
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-red-500/80'
            }`}
          >
            {row.is_archived ? (
              <>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Restore
              </>
            ) : (
              'Archive'
            )}
          </Button>
        </form>
      </CardFooter>
    </Card>
  )
}

function groupByJob(rows: ClientJobPricingRow[], today: string): JobGroup[] {
  const byJob = new Map<string, ClientJobPricingRow[]>()

  for (const row of rows) {
    byJob.set(row.job_id, [...(byJob.get(row.job_id) ?? []), row])
  }

  return [...byJob.entries()]
    .map(([jobId, jobRows]) => ({ jobId, jobName: jobRows[0].job_name, entries: classify(jobRows, today) }))
    .sort((left, right) => left.jobName.localeCompare(right.jobName) || left.jobId.localeCompare(right.jobId))
}

function classify(jobRows: ClientJobPricingRow[], today: string): RuleEntry[] {
  const sorted = [...jobRows].sort((left, right) => right.effective_from.localeCompare(left.effective_from))
  const currentId = sorted.find((row) => !row.is_archived && row.effective_from <= today)?.id

  return sorted.map((row) => {
    let status: RuleStatus

    if (row.is_archived) {
      status = 'Archived'
    } else if (row.id === currentId) {
      status = 'Current'
    } else if (row.effective_from > today) {
      status = 'Scheduled'
    } else {
      status = 'Superseded'
    }

    return { row, status }
  })
}
