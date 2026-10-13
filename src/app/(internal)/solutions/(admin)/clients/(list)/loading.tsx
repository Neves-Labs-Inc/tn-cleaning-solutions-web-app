import ResponsiveListSkeleton from "@/components/admin/list-page/list-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

// Same variable as the real controls: 44px on phones, 36px from md.
const CONTROL_HEIGHT = "h-(--control-height)";

// Mirrors the loaded page (header, controls, cards or table) so nothing jumps
// when data arrives.
export default function ClientsLoading(): React.ReactNode {
  return (
    <div className="space-y-6 lg:space-y-8" aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className={`${CONTROL_HEIGHT} w-full sm:w-36`} />
      </div>

      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_12rem] md:items-center xl:grid-cols-[minmax(0,1fr)_12rem]">
          <Skeleton className={CONTROL_HEIGHT} />
          <div className="grid grid-cols-2 gap-2 md:contents">
            <Skeleton className={CONTROL_HEIGHT} />
            <Skeleton className={`${CONTROL_HEIGHT} xl:hidden`} />
          </div>
        </div>
        {/* A card with a contact line: name, email or phone, badge row. */}
        <ResponsiveListSkeleton cardHeightClassName="h-27" />
      </div>
    </div>
  );
}
