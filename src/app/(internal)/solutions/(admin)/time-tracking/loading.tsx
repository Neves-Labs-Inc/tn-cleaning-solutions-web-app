import TimeSheetsSummarySkeleton from "@/components/admin/time-sheets/summary-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the loaded page (header, range bar, tiles, rows) so nothing jumps when data arrives.
export default function TimeSheetsLoading(): React.ReactNode {
  return (
    <div className="space-y-6 lg:space-y-8" aria-busy="true">
      <span className="sr-only">Loading time sheets</span>
      <Skeleton className="h-8 w-40 sm:h-9" />

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

      <TimeSheetsSummarySkeleton />
    </div>
  );
}
