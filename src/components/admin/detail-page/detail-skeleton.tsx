import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Placeholders that `loading.tsx` files compose; each matches its real piece's height so nothing jumps.
// The consumer wraps them in `aria-busy="true"`.

const DEFAULT_LIST_ROWS = 3;

function getKeys(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

type DetailHeaderSkeletonProps = {
  actionCount?: number;
  badgeCount?: number;
};

export function DetailHeaderSkeleton({
  actionCount = 0,
  badgeCount = 0,
}: DetailHeaderSkeletonProps): React.ReactNode {
  return (
    <div className="min-w-0 space-y-3">
      <Skeleton className="-ml-3 h-(--control-height) w-24" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <Skeleton className="h-8 w-56 max-w-full sm:h-9" />
        {actionCount > 0 ? (
          <div className="grid auto-cols-fr grid-flow-col gap-2 sm:flex">
            {getKeys(actionCount).map((key) => (
              <Skeleton key={key} className="h-(--control-height) sm:w-32" />
            ))}
          </div>
        ) : null}
      </div>
      {badgeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {getKeys(badgeCount).map((key) => (
            <Skeleton key={key} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type TabsSkeletonProps = {
  count: number;
};

export function TabsSkeleton({ count }: TabsSkeletonProps): React.ReactNode {
  return (
    // The rule sits under the triggers, as on the real tab bar.
    <div className="flex gap-1 border-b">
      {getKeys(count).map((key) => (
        <Skeleton
          key={key}
          className="h-(--control-height) flex-1 sm:w-24 sm:flex-none"
        />
      ))}
    </div>
  );
}

export function TabToolbarSkeleton(): React.ReactNode {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Skeleton className="h-5 w-56 max-w-full" />
      <Skeleton className="h-(--control-height) w-full sm:w-36" />
    </div>
  );
}

type ItemListSkeletonProps = {
  rows?: number;
};

export function ItemListSkeleton({
  rows = DEFAULT_LIST_ROWS,
}: ItemListSkeletonProps): React.ReactNode {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="divide-y divide-border">
        {getKeys(rows).map((key) => (
          // Phones: a primary line, two text lines and the action pair. From sm: three text lines.
          <Skeleton key={key} className="h-40 rounded-none sm:h-26" />
        ))}
      </div>
    </Card>
  );
}
