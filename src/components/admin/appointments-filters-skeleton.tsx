import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AppointmentsFiltersSkeletonProps = {
  // A Needs view has no Status filter.
  showStatus?: boolean;
};

export default function AppointmentsFiltersSkeleton({
  showStatus = true,
}: AppointmentsFiltersSkeletonProps): React.ReactNode {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
      <Skeleton className="col-span-2 h-11 md:h-9 md:w-72" />
      <Skeleton className={cn("h-11 md:h-9 md:w-56", !showStatus && "col-span-2")} />
      {showStatus ? <Skeleton className="h-11 md:h-9 md:w-44" /> : null}
    </div>
  );
}
