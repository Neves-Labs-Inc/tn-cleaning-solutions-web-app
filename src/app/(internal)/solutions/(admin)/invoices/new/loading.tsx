import { Skeleton } from '@/components/ui/skeleton'

const ROW_COUNT = 6

export default function NewInvoiceLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-11 w-28" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-11 w-full" />
          </div>
          <div className="divide-y divide-border rounded-lg bg-card ring-1 ring-foreground/10">
            {Array.from({ length: ROW_COUNT }, (_, index) => (
              <div key={index} className="flex h-16 items-center gap-3 px-4">
                <Skeleton className="size-4" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-12 w-full lg:hidden" />
        </div>
        <Skeleton className="hidden h-72 w-full lg:block" />
      </div>
    </div>
  )
}
