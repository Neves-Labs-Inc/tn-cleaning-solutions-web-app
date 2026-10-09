import { Skeleton } from '@/components/ui/skeleton'

const CARD_SKELETON_COUNT = 5
const ROW_SKELETON_COUNT = 8

// Mirrors the loaded page (header, toolbar, cards or table) so nothing jumps when data arrives.
export default function InvoicesLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Skeleton className="order-first col-span-2 h-11 sm:order-none sm:w-36" />
          <Skeleton className="h-11 sm:w-28" />
          <Skeleton className="h-11 sm:w-36" />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_14rem] md:items-center xl:grid-cols-[minmax(0,1fr)_10rem_14rem_auto_auto]">
        <Skeleton className="h-11" />
        <div className="grid grid-cols-2 gap-2 md:contents">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
        <div className="flex flex-wrap gap-x-6 md:col-span-full xl:contents">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-32" />
        </div>
      </div>

      <div className="space-y-3 xl:hidden">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: CARD_SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
        <div className="flex h-14 items-center border-b px-4">
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: ROW_SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-14 rounded-none border-t border-background" />
        ))}
      </div>
    </div>
  )
}
