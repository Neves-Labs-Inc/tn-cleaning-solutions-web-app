import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AppointmentsQuery } from "@/lib/appointments/overview";

import AppointmentsFiltersSkeleton from "./appointments-filters-skeleton";
import AppointmentsListSkeleton from "./appointments-list-skeleton";
import AppointmentsMonthGridSkeleton from "./appointments-month-grid-skeleton";
import AppointmentsNeedsSkeleton from "./appointments-needs-skeleton";
import AppointmentsOverviewTilesSkeleton from "./appointments-overview-tiles-skeleton";
import AppointmentsWeekGridSkeleton from "./appointments-week-grid-skeleton";

type ScreenSkeletonQuery = Pick<
  AppointmentsQuery,
  "view" | "layout" | "month" | "year"
>;

type AppointmentsScreenSkeletonProps = {
  // What the screen is about to show. Without it (the route transition) it is the default Week schedule.
  query?: ScreenSkeletonQuery;
};

function ScheduleCardSkeleton({
  query,
}: {
  query?: ScreenSkeletonQuery;
}): React.ReactNode {
  const isMonth = query?.layout === "month";

  return (
    <>
      {/* Mirrors the real header's boxes and wrapping, so the body doesn't move when it swaps in. */}
      <div
        aria-hidden="true"
        className="flex flex-col gap-3 border-b p-4 md:flex-row md:flex-wrap md:items-center md:justify-between"
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-11 w-full md:h-9 md:w-96" />
          {isMonth ? null : <Skeleton className="hidden h-9 w-24 md:block" />}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 md:ml-auto md:justify-end",
            isMonth ? "justify-end" : "justify-between",
          )}
        >
          {isMonth ? null : <Skeleton className="h-11 w-24 md:hidden" />}
          <Skeleton className="h-11 w-34 md:h-9" />
          <Skeleton className="hidden h-9 w-49 md:block" />
        </div>
      </div>
      {/* Phones always land on the week-grouped list (Month is replaced by it there). */}
      {query?.layout === "list" ? (
        <AppointmentsListSkeleton weekHeader />
      ) : (
        <>
          <div className="md:hidden">
            <AppointmentsListSkeleton weekHeader />
          </div>
          <div className="hidden md:block">
            {query?.layout === "month" ? (
              <AppointmentsMonthGridSkeleton
                month={query.month}
                year={query.year}
              />
            ) : (
              <AppointmentsWeekGridSkeleton />
            )}
          </div>
        </>
      )}
    </>
  );
}

// The screen below its header: tiles, the filter bar, then the card, so nothing jumps when data arrives.
export default function AppointmentsScreenSkeleton({
  query,
}: AppointmentsScreenSkeletonProps): React.ReactNode {
  const needsView =
    query?.view === "needs-billing" || query?.view === "needs-completion"
      ? query.view
      : null;
  const isNeedsView = needsView !== null;

  return (
    <div className="space-y-6" aria-busy="true">
      <AppointmentsOverviewTilesSkeleton />

      <div className="space-y-3">
        <AppointmentsFiltersSkeleton showStatus={!isNeedsView} />
        <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
          {needsView ? (
            <AppointmentsNeedsSkeleton view={needsView} />
          ) : (
            <ScheduleCardSkeleton query={query} />
          )}
        </div>
      </div>
    </div>
  );
}
