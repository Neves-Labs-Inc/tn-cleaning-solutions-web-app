import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import JobsList, { JobRow } from '@/components/admin/jobs-list'


export default async function JobsPage() {
	const supabase = await createClient()

	const [{ data: jobs, error: jobsError }, { data: archivedJobs, error: archivedError }] =
		await Promise.all([
			supabase
				.from('jobs')
				.select('id, name, description, hourly_rate_cents, estimated_duration_minutes, pay_premium_cents, is_archived')
				.eq('is_archived', false)
				.order('name', { ascending: true }),
			supabase
				.from('jobs')
				.select('id, name, description, hourly_rate_cents, estimated_duration_minutes, pay_premium_cents, is_archived')
				.eq('is_archived', true)
				.order('name', { ascending: true }),
		])

	const loadError = jobsError ?? archivedError

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-2">
						<h1 className="text-3xl font-bold tracking-tight text-neutral-950">Jobs</h1>
						<p className="text-sm text-neutral-600">Manage your service offerings</p>
					</div>

					<Link href="/solutions/jobs/new">
						<Button className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
							New Job
						</Button>
					</Link>
				</div>
			</section>

			{loadError ? (
				<section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{loadError.message}
				</section>
			) : null}

			<JobsList 
				jobs={jobs as unknown as JobRow[]} 
				archivedJobs={archivedJobs as unknown as JobRow[]}
			/>
		</div>
	)
}
