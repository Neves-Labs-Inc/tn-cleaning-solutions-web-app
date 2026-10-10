import { Skeleton } from '@/components/ui/skeleton'

const TILE_COUNT = 4
const TODAY_ROW_COUNT = 3
const UPCOMING_ROW_COUNT = 3

// Mirrors the dashboard's layout so nothing jumps when content arrives.
export default function DashboardLoading() {
    return (
        <div className="space-y-6 sm:space-y-8" aria-busy="true">
            <Skeleton className="h-[82px] rounded-3xl sm:h-[94px]" />

            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {Array.from({ length: TILE_COUNT }, (_, index) => (
                    <div
                        key={index}
                        className="@container flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
                    >
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-7 w-24 @[8.5rem]:h-8 @[11rem]:h-9" />
                        <Skeleton className="h-4 w-28" />
                    </div>
                ))}
            </div>

            <div className="space-y-3 rounded-xl pb-4 ring-1 ring-foreground/10">
                <Skeleton className="h-14 rounded-b-none" />
                {Array.from({ length: TODAY_ROW_COUNT }, (_, index) => (
                    <Skeleton key={index} className="mx-4 h-24" />
                ))}
            </div>

            <div className="space-y-3 rounded-xl pb-4 ring-1 ring-foreground/10">
                <Skeleton className="h-14 rounded-b-none" />
                {Array.from({ length: UPCOMING_ROW_COUNT }, (_, index) => (
                    <Skeleton key={index} className="mx-4 h-[72px]" />
                ))}
            </div>
        </div>
    )
}
