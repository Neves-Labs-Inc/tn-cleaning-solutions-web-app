import { Skeleton } from "@/components/ui/skeleton";

const ROW_SKELETON_COUNT = 6;

// The tiles and summary placeholder, shared by loading.tsx and the Suspense fallback so the
// page doesn't jump when data arrives.
export default function TimeSheetsSummarySkeleton(): React.ReactNode {
  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="h-26 rounded-xl" />
        <Skeleton className="h-26 rounded-xl" />
        <Skeleton className="col-span-2 h-26 rounded-xl sm:col-span-1" />
      </div>

      <div className="grid gap-3 md:hidden">
        {Array.from({ length: ROW_SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 md:block">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: ROW_SKELETON_COUNT }, (_, index) => (
          <Skeleton
            key={index}
            className="h-14 rounded-none border-t border-background"
          />
        ))}
      </div>
    </div>
  );
}
