import { Skeleton } from "@/components/ui/skeleton";

const TABLE_ROW_COUNT = 5;
const CARD_COUNT = 3;

// The drill-down's shape (back link, name, range bar, tiles, one day), so a Cleaner or range
// change doesn't flash the summary's skeleton.
export default function CleanerDrilldownSkeleton(): React.ReactNode {
  return (
    <div className="space-y-6 lg:space-y-8" aria-busy="true">
      <span className="sr-only">Loading time sheets</span>
      <div className="space-y-2">
        <Skeleton className="h-11 w-36" />
        <Skeleton className="h-8 w-56 sm:h-9" />
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Skeleton className="size-11 md:size-9" />
            <div className="flex flex-1 justify-center md:min-w-44 md:flex-none">
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="size-11 md:size-9" />
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <Skeleton className="h-11 md:h-9 md:w-28" />
            <Skeleton className="h-11 md:h-9 md:w-36" />
          </div>
        </div>
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="col-span-2 h-24 rounded-xl sm:col-span-1" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      <div className="space-y-2 xl:hidden">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: CARD_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-lg" />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
        <Skeleton className="h-12 rounded-none" />
        <Skeleton className="h-8 rounded-none border-t border-background" />
        {Array.from({ length: TABLE_ROW_COUNT }, (_, index) => (
          <Skeleton
            key={index}
            className="h-16 rounded-none border-t border-background"
          />
        ))}
      </div>
    </div>
  );
}
