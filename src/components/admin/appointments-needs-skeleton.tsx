import { Skeleton } from "@/components/ui/skeleton";

import AppointmentsListSkeleton from "./appointments-list-skeleton";

// The Needs billing and Needs completion card: their header, then the list.
export default function AppointmentsNeedsSkeleton(): React.ReactNode {
  return (
    <div aria-hidden="true">
      <div className="space-y-1 border-b px-4 py-3">
        <Skeleton className="h-7 w-40" />
        {/* The description wraps to two lines below sm, as the real one does. */}
        <Skeleton className="h-10 w-72 max-w-full sm:h-5" />
      </div>
      <AppointmentsListSkeleton />
    </div>
  );
}
