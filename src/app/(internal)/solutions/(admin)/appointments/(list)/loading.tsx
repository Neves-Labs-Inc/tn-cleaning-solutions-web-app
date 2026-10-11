import { Skeleton } from '@/components/ui/skeleton'
import { StatTileSkeleton } from '@/components/ui/stat-tile'

const TILES = 4
const PHONE_BANDS = 2
const ROWS_PER_BAND = 3
const CALENDAR_CELLS = 35

// Mirrors the loaded page (header, tiles, the filter bar, then the list on phones or the calendar
// from md) so nothing jumps when data arrives.
export default function AppointmentsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-full sm:w-44" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: TILES }, (_, tile) => (
          <StatTileSkeleton key={tile} icon caption fitValue />
        ))}
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:flex md:gap-3">
          <Skeleton className="col-span-2 h-11 md:h-9 md:w-72" />
          <Skeleton className="h-11 md:h-9 md:w-56" />
          <Skeleton className="h-11 md:h-9 md:w-44" />
        </div>
        <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          <div className="flex h-14 items-center border-b px-4">
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="md:hidden">
            {Array.from({ length: PHONE_BANDS }, (_, band) => (
              <div key={band}>
                <Skeleton className="h-9 rounded-none" />
                {Array.from({ length: ROWS_PER_BAND }, (_, row) => (
                  <Skeleton key={row} className="h-16 rounded-none border-t border-background" />
                ))}
              </div>
            ))}
          </div>
          <div className="hidden p-4 md:block">
            <div className="hidden grid-cols-7 gap-px md:grid">
              {Array.from({ length: CALENDAR_CELLS }, (_, cell) => (
                <Skeleton key={cell} className="h-32 rounded-none" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
