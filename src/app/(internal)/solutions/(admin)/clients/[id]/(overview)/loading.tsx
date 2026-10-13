import {
	DetailHeaderSkeleton,
	ItemListSkeleton,
	TabsSkeleton,
	TabToolbarSkeleton,
} from '@/components/admin/detail-page/detail-skeleton'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const CLIENT_TAB_COUNT = 3

function InfoTermSkeleton({ className }: { className?: string }) {
	return (
		<div className={cn('space-y-1', className)}>
			<Skeleton className="h-4 w-12" />
			<Skeleton className="h-6 w-40 max-w-full" />
		</div>
	)
}

// Mirrors the client page top to bottom (header, Client info, tabs, a tab body) so nothing jumps when it
// loads. loading.tsx can't read `?tab=`, so one list body stands in for Locations and Pricing.
export default function ClientDetailLoading() {
	return (
		<div className="space-y-6 lg:space-y-8" aria-busy="true">
			<DetailHeaderSkeleton actionCount={2} badgeCount={2} />

			<Card className="p-4 sm:p-5">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
					<InfoTermSkeleton />
					<InfoTermSkeleton />
					<InfoTermSkeleton className="sm:col-span-2 lg:col-span-1" />
				</div>
			</Card>

			<div className="space-y-4">
				<TabsSkeleton count={CLIENT_TAB_COUNT} />
				<TabToolbarSkeleton />
				<ItemListSkeleton rows={3} />
			</div>
		</div>
	)
}
