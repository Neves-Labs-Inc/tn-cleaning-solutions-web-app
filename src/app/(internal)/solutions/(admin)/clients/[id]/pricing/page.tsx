import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import {
  ClientJobPricingList,
  type ClientJobPricingRow,
} from '@/components/admin/client-job-pricing-list'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { getBusinessDate } from '@/lib/schedule'

type ClientJobPricingPageProps = {
  params: Promise<{ id: string }>
}

type PricingQueryRow = {
  id: string
  job_id: string
  hourly_rate_cents: number
  effective_from: string
  notes: string | null
  is_archived: boolean
  jobs: { name: string } | { name: string }[]
}

export default async function ClientJobPricingPage({ params }: ClientJobPricingPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: client, error: clientError }, { data: pricing, error: pricingError }] =
    await Promise.all([
      supabase.from('clients').select('id, name, is_archived').eq('id', id).maybeSingle(),
      supabase
        .from('client_job_pricing')
        .select('id, job_id, hourly_rate_cents, effective_from, notes, is_archived, jobs!inner(name)')
        .eq('client_id', id)
        .order('effective_from', { ascending: false }),
    ])

  if (clientError || !client || client.is_archived) {
    notFound()
  }

  const rows = ((pricing ?? []) as PricingQueryRow[]).map(toRow)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <Link
              href={`/solutions/clients/${id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Back to Client
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Custom Pricing</h1>
              <p className="mt-2 text-sm text-neutral-600">
                Hourly rates for {client.name} that override each job&apos;s standard rate.
              </p>
            </div>
          </div>

          <Link href={`/solutions/clients/${id}/pricing/new`}>
            <Button className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
              Add Rate
            </Button>
          </Link>
        </div>
      </section>

      {pricingError ? (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {pricingError.message}
        </section>
      ) : null}

      <ClientJobPricingList clientId={id} rows={rows} today={todayDateString()} />
    </div>
  )
}

function toRow(row: PricingQueryRow): ClientJobPricingRow {
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs

  return {
    id: row.id,
    job_id: row.job_id,
    job_name: job?.name ?? '',
    hourly_rate_cents: row.hourly_rate_cents,
    effective_from: row.effective_from,
    notes: row.notes,
    is_archived: row.is_archived,
  }
}

function todayDateString() {
  return getBusinessDate(new Date())
}
