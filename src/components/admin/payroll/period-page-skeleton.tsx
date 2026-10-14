import { Skeleton } from "@/components/ui/skeleton";

const RUN_SKELETON_COUNT = 4;

// The period page placeholder: back link, header, status row, then run cards below xl and a
// table shell from xl.
export default function PeriodPageSkeleton(): React.ReactNode {
  return (
    <div className="space-y-6 lg:space-y-8" aria-busy="true">
      <span className="sr-only">Loading pay period</span>
      <Skeleton className="h-11 w-36 md:h-9" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full sm:h-9" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-6 w-48" />

      <div className="space-y-3 xl:hidden">
        {Array.from({ length: RUN_SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-lg" />
        ))}
        <Skeleton className="h-11 rounded-lg" />
      </div>

      <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: RUN_SKELETON_COUNT }, (_, index) => (
          <Skeleton
            key={index}
            className="h-14 rounded-none border-t border-background"
          />
        ))}
        <Skeleton className="h-10 rounded-none border-t border-background" />
      </div>
    </div>
  );
}
