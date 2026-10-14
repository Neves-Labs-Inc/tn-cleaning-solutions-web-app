import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTileSkeleton } from '@/components/ui/stat-tile'

const RUN_KEYS = Array.from({ length: 4 }, (_, index) => index)

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-56" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTileSkeleton caption />
        <StatTileSkeleton caption />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-5 w-14" />
        </div>
        <div className="flex flex-col gap-3">
          {RUN_KEYS.map((key) => (
            <Card key={key} className="gap-0 rounded-xl p-0 py-0">
              <div className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-3 px-4 py-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-4 w-48 max-w-full" />
                </div>
                <Skeleton className="h-6 w-20" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
