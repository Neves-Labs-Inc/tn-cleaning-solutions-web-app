import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { JobForm } from '@/components/admin/job-form'
import { createClient } from '@/lib/supabase/server'

type EditJobPageProps = {
  params: Promise<{ id: string }>
}

export default async function EditJobPage({ params }: EditJobPageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('id, name, description, hourly_rate_cents, estimated_duration_minutes, pay_premium_cents, is_archived')
    .eq('id', id)
    .maybeSingle()

  if (error || !job || job.is_archived) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
        <div className="space-y-3">
          <Link
            href="/solutions/jobs"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Jobs
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Edit Job</h1>
            <p className="mt-2 text-sm text-neutral-600">Update job details and pricing.</p>
          </div>
        </div>
      </section>

      <JobForm
        job={{
          id: job.id,
          name: job.name,
          description: job.description,
          hourly_rate_cents: job.hourly_rate_cents,
          estimated_duration_minutes: job.estimated_duration_minutes,
          pay_premium_cents: job.pay_premium_cents,
        }}
      />
    </div>
  )
}
