import { Skeleton } from '@/components/ui/skeleton'

const TODAY_CARD_SKELETON_COUNT = 1 // most days have a single stop
const ROW_SKELETON_COUNT = 6

// Mirrors the loaded page so swapping skeleton for content shifts nothing noticeable.
function CardSkeleton() {
	return (
		<div className="space-y-3 rounded-lg p-4 ring-1 ring-foreground/10">
			<Skeleton className="h-4 w-36" />
			<Skeleton className="h-5 w-3/4" />
			<Skeleton className="h-4 w-1/2" />
			<div className="flex gap-2">
				<Skeleton className="h-6 w-20 rounded-full" />
				<Skeleton className="h-6 w-24 rounded-full" />
			</div>
			<Skeleton className="h-12 w-full" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
			</div>
			<Skeleton className="h-4 w-3/5" />
			<div className="grid grid-cols-2 gap-2">
				<Skeleton className="h-11" />
				<Skeleton className="h-11" />
			</div>
			<Skeleton className="h-3 w-16" />
			<Skeleton className="h-11 w-full" />
			<Skeleton className="h-11 w-full" />
		</div>
	)
}

export default function ScheduleLoading() {
	return (
		<div className="space-y-6 lg:space-y-8" aria-busy="true">
			<Skeleton className="h-7 w-40" />
			<div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
				<div className="space-y-3">
					{Array.from({ length: TODAY_CARD_SKELETON_COUNT }, (_, index) => (
						<CardSkeleton key={index} />
					))}
				</div>
				<div className="space-y-3">
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-4 w-24" />
					{Array.from({ length: ROW_SKELETON_COUNT }, (_, index) => (
						<Skeleton key={index} className="h-16 w-full rounded-lg" />
					))}
				</div>
				<Skeleton className="h-11 w-full lg:col-span-2" />
			</div>
		</div>
	)
}
