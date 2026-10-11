import { AutomaticInvoicingSwitchSkeleton } from '@/components/admin/automatic-invoicing-switch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTileSkeleton } from '@/components/ui/stat-tile'
import { cn } from '@/lib/utils'

const LIST_ROWS = [0, 1, 2]
const LOCATION_CARDS = [0, 1]

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

function InfoTermSkeleton({ className }: { className?: string }) {
	return (
		<div className={cn('space-y-1', className)}>
			<Skeleton className="h-4 w-12" />
			<Skeleton className="h-6 w-40" />
		</div>
	)
}

// Mirrors the client page top to bottom (header, Billing, Client info, Locations) so nothing jumps when it loads.
export default function ClientDetailLoading() {
	return (
		<div className="space-y-6 lg:space-y-8" aria-busy="true">
			<div className="min-w-0 space-y-3">
				<Skeleton className="-ml-3 h-(--control-height) w-24" />
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
					<Skeleton className="h-8 w-56 sm:h-9" />
					<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
						<Skeleton className="h-(--control-height) sm:w-32" />
						<Skeleton className="h-(--control-height) sm:w-32" />
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Skeleton className="h-6 w-16 rounded-full" />
					<Skeleton className="h-6 w-16 rounded-full" />
				</div>
			</div>

			<section className="space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<Skeleton className="h-7 w-24" />
					<div className="grid grid-cols-2 gap-2 sm:flex">
						<Skeleton className="h-11 sm:w-28 md:h-9" />
						<Skeleton className="h-11 sm:w-32 md:h-9" />
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<StatTileSkeleton fitValue caption />
					<StatTileSkeleton fitValue caption />
					<div className="col-span-2">
						<AutomaticInvoicingSwitchSkeleton />
					</div>
				</div>
				<div className="grid gap-6 lg:grid-cols-2 lg:items-start">
					<ListCardSkeleton />
					<ListCardSkeleton />
				</div>
			</section>

			<Card className="gap-4 p-4 sm:p-5">
				<Skeleton className="h-7 w-28" />
				<div className="grid gap-4 sm:grid-cols-2">
					<InfoTermSkeleton />
					<InfoTermSkeleton />
					<InfoTermSkeleton className="sm:col-span-2" />
				</div>
			</Card>

			<section className="space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-0">
						<Skeleton className="h-7 w-28" />
						<Skeleton className="h-5 w-64 max-w-full" />
					</div>
					<Skeleton className="h-(--control-height) w-full sm:w-36" />
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					{LOCATION_CARDS.map((card) => (
						<Skeleton key={card} className="h-44 rounded-xl" />
					))}
				</div>
			</section>
		</div>
	)
}
