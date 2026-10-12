import { Skeleton } from "@/components/ui/skeleton";

type AppointmentsListSkeletonProps = {
  bands?: number;
  rowsPerBand?: number;
};

// The date-band and row list, edge to edge in the card.
export default function AppointmentsListSkeleton({
  bands = 2,
  rowsPerBand = 3,
}: AppointmentsListSkeletonProps): React.ReactNode {
  return (
    <div aria-hidden="true">
      {Array.from({ length: bands }, (_, band) => (
        <div key={band}>
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
