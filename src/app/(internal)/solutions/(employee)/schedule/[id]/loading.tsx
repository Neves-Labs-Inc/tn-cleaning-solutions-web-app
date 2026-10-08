import { Skeleton } from '@/components/ui/skeleton'

// Mirrors page.tsx grid placement so the real page replaces it without a layout jump.
export default function AppointmentLoading() {
	return (
		<div className="mx-auto grid max-w-2xl grid-cols-1 gap-6 lg:max-w-4xl lg:grid-cols-2 lg:gap-8" aria-busy="true" aria-label="Loading appointment">
			<div className="space-y-3 md:row-start-1 lg:col-span-2">
				<Skeleton className="h-7 w-48" />
				<Skeleton className="h-5 w-24 rounded-full" />
				<Skeleton className="h-5 w-56" />
			</div>
			<div className="space-y-6 lg:col-start-1 lg:row-start-3">
				<Skeleton className="h-28 w-full rounded-lg" />
				<Skeleton className="h-28 w-full rounded-lg" />
			</div>
			<Skeleton className="h-28 w-full rounded-lg lg:col-start-2 lg:row-start-3" />
			<div className="sticky bottom-[calc(3.5rem+var(--safe-bottom))] z-30 -mx-4 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur sm:-mx-6 md:static md:mx-0 md:row-start-2 md:border-0 md:bg-transparent md:p-0 md:shadow-none lg:col-span-2">
				<div className="md:max-w-sm">
					<Skeleton className="mb-2 h-5 w-40 rounded-full" />
					<Skeleton className="h-12 w-full" />
				</div>
			</div>
		</div>
	)
}
