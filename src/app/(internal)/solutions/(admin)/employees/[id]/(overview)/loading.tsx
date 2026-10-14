import {
	DetailHeaderSkeleton,
	ItemListSkeleton,
} from '@/components/admin/detail-page/detail-skeleton'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors the employee page top to bottom (header, Contact, Pay) so nothing jumps when it loads.
// In the (overview) group so edit and time-sheets don't fall back to it.
export default function EmployeeDetailLoading() {
	return (
		<div className="space-y-6" aria-busy="true">
			<DetailHeaderSkeleton actionCount={1} badgeCount={1} />

			<Card className="p-4 sm:p-5">
				<Skeleton className="h-48" />
			</Card>

			<Card className="gap-6 p-4 sm:p-5">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-1">
						<Skeleton className="h-7 w-16" />
						<Skeleton className="h-5 w-64 max-w-full" />
					</div>
					<Skeleton className="h-(--control-height) w-full sm:w-40" />
				</div>
				<div className="space-y-3">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<Skeleton className="h-6 w-24" />
						<Skeleton className="h-(--control-height) w-full sm:w-32" />
					</div>
					<ItemListSkeleton rows={2} />
				</div>
				<Skeleton className="h-20" />
			</Card>
		</div>
	)
}
