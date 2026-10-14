'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { Archive, BriefcaseBusiness, RotateCcw, Search, SquareCheckBig } from 'lucide-react'

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { useAppointmentsCache } from '@/hooks/use-appointments-cache'
import { archiveJobs, restoreJobs } from '@/lib/actions/jobs'
import { appointmentsKeys } from '@/lib/appointments/appointments-keys'
import { formatPremium, formatRate } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

export type JobRow = {
	id: string
	name: string
	description: string | null
	hourly_rate_cents: number
	estimated_duration_minutes: number | null
	pay_premium_cents: number
	is_archived: boolean
}

type JobsSectionProps = {
	jobs: JobRow[]
	archived?: boolean
	searchSlot?: ReactNode
	selectionResetKey?: string
}

type JobCardProps = {
	job: JobRow
	archived?: boolean
	selectMode: boolean
	selected: boolean
	onToggle: (id: string) => void
}

const cardSurface = 'h-full rounded-2xl border border-neutral-200 bg-white py-0 shadow-sm shadow-emerald-950/5'

const toolbarPill =
	'h-11 shrink-0 cursor-pointer rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50'

const emeraldPill =
	'h-11 shrink-0 cursor-pointer rounded-full border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700 hover:bg-emerald-100'

export default function JobsList({ jobs, archivedJobs }: { jobs?: JobRow[]; archivedJobs?: JobRow[] }) {
	const [query, setQuery] = useState('')
	const normalizedQuery = query.trim().toLowerCase()
	const filteredJobs = (jobs ?? []).filter((job) => {
		if (!normalizedQuery) {
			return true
		}

		return job.name.toLowerCase().includes(normalizedQuery) || job.description?.toLowerCase().includes(normalizedQuery)
	})

	return (
		<>
			{(jobs?.length ?? 0) > 0 ? (
				<section>
					<JobsSection
						jobs={filteredJobs}
						selectionResetKey={normalizedQuery}
						searchSlot={
							<div className="relative flex-1">
								<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
								<input
									type="text"
									value={query}
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search jobs…"
									className="h-11 w-full rounded-full border border-neutral-200 bg-white px-4 pl-10 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
								/>
							</div>
						}
					/>
				</section>
			) : (
				<section className="rounded-2xl border border-emerald-100 bg-white p-10 shadow-sm shadow-emerald-950/5">
					<div className="mx-auto flex max-w-md flex-col items-center text-center">
						<div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
							<BriefcaseBusiness className="size-6" aria-hidden="true" />
						</div>
						<h2 className="text-lg font-semibold text-neutral-950">No jobs yet</h2>
						<p className="mt-2 text-sm leading-6 text-neutral-600">
							Create your first service offering to start assigning jobs to appointments.
						</p>
					</div>
				</section>
			)}

			{(archivedJobs?.length ?? 0) > 0 ? (
				<section>
					<details className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-emerald-950/5">
						<summary className="cursor-pointer list-none rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-500">
							<div className="flex items-center justify-between gap-3">
								<h2 className="text-base font-semibold text-neutral-950">Archived Jobs</h2>
								<span className="rounded-full border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600">
									{archivedJobs?.length}
								</span>
							</div>
						</summary>
						<div className="mt-4">
							<JobsSection jobs={archivedJobs ?? []} archived />
						</div>
					</details>
				</section>
			) : null}
		</>
	)
}

function JobsSection({ jobs, archived, searchSlot, selectionResetKey = '' }: JobsSectionProps) {
	const [selectMode, setSelectMode] = useState(false)
	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [errorMessage, setErrorMessage] = useState('')
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [appliedResetKey, setAppliedResetKey] = useState(selectionResetKey)
	const [isPending, startTransition] = useTransition()
	const appointmentsCache = useAppointmentsCache()

	if (appliedResetKey !== selectionResetKey) {
		setAppliedResetKey(selectionResetKey)
		setSelectedIds([])
	}

	const allSelected = jobs.length > 0 && selectedIds.length === jobs.length

	function exitSelectMode() {
		setSelectMode(false)
		setSelectedIds([])
		setErrorMessage('')
	}

	function toggleSelectMode() {
		if (selectMode) {
			exitSelectMode()
		} else {
			setSelectMode(true)
		}
	}

	function toggleJob(id: string) {
		setSelectedIds((current) =>
			current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
		)
	}

	function toggleSelectAll() {
		setSelectedIds(allSelected ? [] : jobs.map((job) => job.id))
	}

	function runBulkAction() {
		setConfirmOpen(false)

		startTransition(async () => {
			const result = archived ? await restoreJobs(selectedIds) : await archiveJobs(selectedIds)

			if (result.success) {
				// The Job filter lists only active jobs, so it needs the new set.
				void appointmentsCache.refresh([appointmentsKeys.filterOptions])
				setSelectMode(false)
				setSelectedIds([])
				setErrorMessage('')
			} else {
				setErrorMessage(result.error)
			}
		})
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				{searchSlot}
				<Button
					type="button"
					variant="outline"
					aria-pressed={selectMode}
					onClick={toggleSelectMode}
					className={cn(toolbarPill, selectMode && 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100')}
				>
					<SquareCheckBig className="size-4" aria-hidden="true" />
					{selectMode ? 'Cancel' : 'Select'}
				</Button>
			</div>

			{selectMode ? (
				<div className="sticky bottom-4 z-20 space-y-2 md:static">
					<div className="flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-sm shadow-emerald-950/5 backdrop-blur">
						<p className="mr-auto text-sm font-medium text-neutral-700" aria-live="polite">
							{selectedIds.length} of {jobs.length} selected
						</p>

						<Button type="button" variant="outline" onClick={toggleSelectAll} className={toolbarPill}>
							{allSelected ? 'Clear' : 'Select all'}
						</Button>

						{archived ? (
							<Button
								type="button"
								variant="outline"
								disabled={selectedIds.length === 0 || isPending}
								onClick={runBulkAction}
								className={emeraldPill}
							>
								<RotateCcw className="size-4" aria-hidden="true" />
								Restore
							</Button>
						) : (
							<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
								<AlertDialogTrigger
									disabled={selectedIds.length === 0 || isPending}
									render={
										<Button
											type="button"
											variant="outline"
											className="h-11 shrink-0 cursor-pointer rounded-full border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100"
										/>
									}
								>
									<Archive className="size-4" aria-hidden="true" />
									Archive
								</AlertDialogTrigger>

								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Archive {selectedIds.length} job{selectedIds.length === 1 ? '' : 's'}?</AlertDialogTitle>
										<AlertDialogDescription>
											Archived jobs stop appearing when scheduling new appointments. You can restore them from the
											Archived Jobs section at any time.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel className="h-9 rounded-full px-4 text-sm">Cancel</AlertDialogCancel>
										<AlertDialogAction
											type="button"
											disabled={isPending}
											onClick={runBulkAction}
											className="h-9 rounded-full bg-red-600 px-4 text-sm text-white hover:bg-red-700"
										>
											Archive
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						)}

						<Button type="button" variant="outline" onClick={exitSelectMode} className={toolbarPill}>
							Done
						</Button>
					</div>

					{errorMessage ? (
						<div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert" aria-live="polite">
							{errorMessage}
						</div>
					) : null}
				</div>
			) : null}

			{jobs.length > 0 ? (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{jobs.map((job) => (
						<JobCard
							key={job.id}
							job={job}
							archived={archived}
							selectMode={selectMode}
							selected={selectedIds.includes(job.id)}
							onToggle={toggleJob}
						/>
					))}
				</div>
			) : (
				<div className="rounded-2xl border border-emerald-100 bg-white px-4 py-8 text-center text-sm text-neutral-600 shadow-sm shadow-emerald-950/5">
					No jobs match your search.
				</div>
			)}
		</div>
	)
}

function JobCard({ job, archived, selectMode, selected, onToggle }: JobCardProps) {
	const body = (
		<>
			<CardHeader className="gap-2 border-b border-neutral-100 px-5 py-4">
				<div className="flex items-start justify-between gap-3">
					{selectMode ? (
						<span className="contents" onClick={(event) => event.stopPropagation()}>
							<Checkbox
								checked={selected}
								onCheckedChange={() => onToggle(job.id)}
								aria-label={`Select ${job.name}`}
								className="mt-0.5 border-neutral-300 after:-inset-3.5 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/40 data-checked:border-emerald-600 data-checked:bg-emerald-600 data-checked:text-white"
							/>
						</span>
					) : null}

					<div className="min-w-0 flex-1">
						<CardTitle className="truncate text-base font-semibold text-neutral-950">{job.name}</CardTitle>
						<p className="mt-1 text-xs text-neutral-500">{formatDuration(job.estimated_duration_minutes)}</p>
					</div>

					<span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
						{formatRate(job.hourly_rate_cents)}
					</span>
				</div>
			</CardHeader>

			<CardContent className="px-5 py-4">
				<p className="min-h-11 text-sm leading-6 text-neutral-600">{shortDescription(job.description)}</p>
				<dl className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3">
					<dt className="text-xs text-muted-foreground">Job pay premium</dt>
					<dd
						className={cn(
							'text-sm font-medium tabular-nums text-foreground',
							job.pay_premium_cents === 0 && 'font-normal text-muted-foreground',
						)}
					>
						{formatPremium(job.pay_premium_cents)}
					</dd>
				</dl>
			</CardContent>
		</>
	)

	const surface = cn(cardSurface, selected && 'border-emerald-400 ring-2 ring-emerald-500/40')
	let card: ReactNode

	if (selectMode) {
		card = (
			<div className="h-full cursor-pointer" onClick={() => onToggle(job.id)}>
				<Card className={surface}>{body}</Card>
			</div>
		)
	} else if (archived) {
		card = <Card className={surface}>{body}</Card>
	} else {
		card = (
			<Link
				href={`/solutions/jobs/${job.id}/edit`}
				className="group block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
			>
				<Card className={cn(surface, 'transition-all group-hover:border-emerald-300 group-hover:shadow-md group-hover:shadow-emerald-950/10')}>
					{body}
				</Card>
			</Link>
		)
	}

	return card
}

function formatDuration(totalMinutes: number | null) {
	if (!totalMinutes) {
		return 'No estimate'
	}

	const hours = Math.floor(totalMinutes / 60)
	const minutes = totalMinutes % 60

	if (hours > 0 && minutes > 0) {
		return `${hours}h ${minutes}m`
	}

	if (hours > 0) {
		return `${hours}h`
	}

	return `${minutes}m`
}

function shortDescription(description: string | null) {
	if (!description) {
		return 'No description provided.'
	}

	if (description.length <= 120) {
		return description
	}

	return `${description.slice(0, 117)}...`
}
