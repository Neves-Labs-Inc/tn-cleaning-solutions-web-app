import { Skeleton } from '@/components/ui/skeleton'

const ROW_SKELETON_COUNT = 3

// Mirrors the detail page (header, Visits card, side card, phone action bar) so nothing jumps.
export default function InvoiceDetailLoading() {
  return (
    <div className="space-y-6 pb-[calc(8rem+var(--safe-bottom))] md:pb-0" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-6 w-40" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4 rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:p-5 lg:col-span-2">
          <Skeleton className="h-6 w-24" />
          {Array.from({ length: ROW_SKELETON_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-lg" />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur md:hidden">
        <Skeleton className="h-12" />
      </div>
    </div>
  )
}
