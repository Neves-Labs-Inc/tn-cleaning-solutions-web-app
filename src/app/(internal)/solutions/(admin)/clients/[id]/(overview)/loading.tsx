import { Skeleton } from '@/components/ui/skeleton'

const LIST_ROWS = [0, 1, 2]

function ListCardSkeleton() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-6 w-40" />
			<div className="divide-y divide-border overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
				{LIST_ROWS.map((row) => (
					<Skeleton key={row} className="h-16 rounded-none" />
				))}
			</div>
		</div>
	)
}

// Mirrors the client page: header card, Billing, then Client Info, so nothing jumps when it loads.
export default function ClientDetailLoading() {
	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-3">
						<Skeleton className="h-7 w-32 rounded-full" />
						<Skeleton className="h-9 w-56" />
						<Skeleton className="h-6 w-16 rounded-full" />
					</div>
					<div className="flex flex-wrap gap-2">
						<Skeleton className="h-10 w-36" />
						<Skeleton className="h-10 w-36" />
					</div>
				</div>
			</section>

			<section className="space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<Skeleton className="h-6 w-24" />
					<div className="grid grid-cols-2 gap-2 sm:flex">
						<Skeleton className="h-11 sm:w-28 md:h-9" />
						<Skeleton className="h-11 sm:w-32 md:h-9" />
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Skeleton className="h-25 rounded-xl" />
					<Skeleton className="h-25 rounded-xl" />
					<Skeleton className="col-span-2 h-35 rounded-xl" />
				</div>
				<div className="grid gap-6 lg:grid-cols-2 lg:items-start">
					<ListCardSkeleton />
					<ListCardSkeleton />
				</div>
			</section>

			<Skeleton className="h-40" />
		</div>
	)
}
