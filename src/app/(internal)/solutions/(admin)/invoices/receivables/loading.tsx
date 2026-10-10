import { Skeleton } from '@/components/ui/skeleton'

const TILE_COUNT = 4
const CLIENT_ROW_COUNT = 4
const OVERDUE_ROW_COUNT = 2

function SectionTitle() {
  return (
    <div className="space-y-1">
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-5 w-72 max-w-full" />
    </div>
  )
}

// Mirrors the loaded page (header, four tiles, three sections) so nothing jumps when data arrives.
export default function ReceivablesLoading() {
  return (
    <div className="space-y-6 lg:space-y-8" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-11 w-28 md:h-9" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: TILE_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-26 rounded-xl" />
        ))}
      </div>

      <div className="space-y-3">
        <SectionTitle />
        <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          {Array.from({ length: CLIENT_ROW_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-none border-t border-background first:border-t-0 md:h-11" />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle />
        <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          {Array.from({ length: OVERDUE_ROW_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-none border-t border-background first:border-t-0 lg:h-16" />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <SectionTitle />
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
