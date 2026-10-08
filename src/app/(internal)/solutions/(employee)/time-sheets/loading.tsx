import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ROW_KEYS = Array.from({ length: 6 }, (_, i) => i);

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-32" />
        <div className="flex items-center justify-between gap-2 sm:gap-1">
          <Skeleton className="size-11 md:size-9" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="size-11 md:size-9" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Skeleton className="h-[84px] rounded-xl sm:h-[88px]" />
        <Skeleton className="h-[84px] rounded-xl sm:h-[88px]" />
        <Skeleton className="col-span-2 h-[84px] rounded-xl sm:col-span-1 sm:h-[88px]" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-11 w-full md:h-9" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Card className="gap-0 divide-y divide-border p-0 py-0">
          {ROW_KEYS.map((key) => (
            <div
              key={key}
              className="flex min-h-16 items-center justify-between gap-3 px-4 py-3"
            >
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-48 max-w-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
