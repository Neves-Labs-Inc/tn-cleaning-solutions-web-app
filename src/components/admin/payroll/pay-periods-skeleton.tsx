import { Skeleton } from "@/components/ui/skeleton";

const CARD_SKELETON_COUNT = 5;
const ROW_SKELETON_COUNT = 6;

// The Pay periods list placeholder: header, cards below xl, a table shell from xl.
export default function PayPeriodsSkeleton(): React.ReactNode {
  return (
    <div className="space-y-6 lg:space-y-8" aria-busy="true">
      <span className="sr-only">Loading pay periods</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-40 sm:h-9" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <div className="grid gap-3 xl:hidden">
        {Array.from({ length: CARD_SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-27 rounded-lg" />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
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
