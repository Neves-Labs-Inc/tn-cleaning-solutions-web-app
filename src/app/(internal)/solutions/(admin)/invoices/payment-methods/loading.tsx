import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ROW_SKELETON_COUNT = 4;

// Mirrors the loaded page so swapping skeleton for content shifts nothing.
export default function PaymentMethodsLoading(): React.ReactNode {
  return (
    <div className="max-w-2xl space-y-6 lg:space-y-8" aria-busy="true">
      <Skeleton className="h-11 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Card className="gap-0 p-0">
        <div className="divide-y divide-border">
          {Array.from({ length: ROW_SKELETON_COUNT }, (_, index) => (
            <div key={index} className="flex h-16 items-center px-4">
              <Skeleton className="h-5 w-32" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
