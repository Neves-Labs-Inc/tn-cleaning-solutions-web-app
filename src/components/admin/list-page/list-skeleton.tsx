import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ResponsiveListSkeletonProps = {
  cards?: number;
  rows?: number;
  // A height class matching the caller's loaded card, e.g. "h-27".
  cardHeightClassName?: string;
};

const DEFAULT_CARDS = 6;
const DEFAULT_ROWS = 8;
const DEFAULT_CARD_HEIGHT_CLASS_NAME = "h-24";

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

// Mirrors ResponsiveList's loaded heights so the swap doesn't shift the page.
export default function ResponsiveListSkeleton({
  cards = DEFAULT_CARDS,
  rows = DEFAULT_ROWS,
  cardHeightClassName = DEFAULT_CARD_HEIGHT_CLASS_NAME,
}: ResponsiveListSkeletonProps): React.ReactNode {
  return (
    <div aria-busy="true">
      <div className="xl:hidden">
        <div className="mb-3 flex min-h-11 items-center">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="space-y-3">
          {range(cards).map((index) => (
            <Skeleton
              key={index}
              className={cn("rounded-lg", cardHeightClassName)}
            />
          ))}
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
        <div className="flex h-14 items-center border-b px-4">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="h-10 border-b" />
        {range(rows).map((index) => (
          <div
            key={index}
            className="flex h-14 items-center border-b px-4 last:border-0"
          >
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
