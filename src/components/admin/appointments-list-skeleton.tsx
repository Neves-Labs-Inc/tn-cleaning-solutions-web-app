import { Skeleton } from "@/components/ui/skeleton";

type AppointmentsListSkeletonProps = {
  bands?: number;
  rowsPerBand?: number;
  // The schedule list's week header, shown below md only, so nothing jumps when the weeks land.
  weekHeader?: boolean;
};

// The date-band and row list, edge to edge in the card.
export default function AppointmentsListSkeleton({
  bands = 2,
  rowsPerBand = 3,
  weekHeader = false,
}: AppointmentsListSkeletonProps): React.ReactNode {
  return (
    <div aria-hidden="true">
      {Array.from({ length: bands }, (_, band) => (
        <div key={band}>
          {weekHeader ? (
            <div className="min-h-11 border-b bg-card px-4 py-2 md:hidden">
              <Skeleton className="h-5 w-28" />
            </div>
          ) : null}
          <Skeleton className="h-9 rounded-none" />
          {Array.from({ length: rowsPerBand }, (_, row) => (
            <Skeleton
              key={row}
              className="h-16 rounded-none border-t border-background"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
