import { Skeleton } from "@/components/ui/skeleton";

const WEEK_DAYS = 7;

// The desktop week grid: a head row, then a body row, in the same inset and border as the real grid.
export default function AppointmentsWeekGridSkeleton(): React.ReactNode {
  return (
    <div aria-hidden="true" className="p-4">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {Array.from({ length: WEEK_DAYS }, (_, day) => (
          <Skeleton key={`head-${day}`} className="h-14 rounded-none" />
        ))}
        {Array.from({ length: WEEK_DAYS }, (_, day) => (
          <Skeleton key={`body-${day}`} className="h-48 rounded-none" />
        ))}
      </div>
    </div>
  );
}
