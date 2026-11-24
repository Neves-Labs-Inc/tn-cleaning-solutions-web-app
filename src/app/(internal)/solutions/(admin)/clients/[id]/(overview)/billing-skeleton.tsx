'use client'

import { useSearchParams } from 'next/navigation'

import { ItemListSkeleton, TabToolbarSkeleton } from '@/components/admin/detail-page/detail-skeleton'
import { StatTileSkeleton } from '@/components/ui/stat-tile'
import { Skeleton } from '@/components/ui/skeleton'

const CARD_CLASS_NAME = 'overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-foreground/10'

function SectionSkeleton({ rowCount, rowClassName }: { rowCount: number; rowClassName: string }) {
  return (
    <div className="space-y-3">
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className={CARD_CLASS_NAME}>
        <div className="divide-y divide-border">
          {Array.from({ length: rowCount }, (_, index) => (
            // The trailing spacer is the row's 44px PDF cell.
            <div key={index} className="flex items-center pr-1">
              <Skeleton className={`${rowClassName} min-w-0 flex-1 rounded-none`} />
              <span className="ml-2 size-11 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// The Billing tab's shape at the same row heights, so nothing jumps when it loads.
function BillingSkeleton() {
  return (
    <div className="animate-in space-y-6 duration-slow fade-in-0">
      <TabToolbarSkeleton />
      <div className="grid grid-cols-2 gap-3">
        <StatTileSkeleton caption fitValue wrapHeader />
        <StatTileSkeleton caption fitValue wrapHeader />
      </div>
      <SectionSkeleton rowCount={1} rowClassName="h-[72px]" />
      <SectionSkeleton rowCount={3} rowClassName="h-[72px]" />
      <div className="space-y-3">
        <div className="flex min-h-11 items-center">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className={CARD_CLASS_NAME}>
          <Skeleton className="h-12 w-full rounded-none" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-none border-t border-border" />
          ))}
        </div>
      </div>
      <SectionSkeleton rowCount={3} rowClassName="h-[72px]" />
    </div>
  )
}

// loading.tsx stands in for every tab; on a direct visit to ?tab=billing it shows this tab's shape.
export function ClientTabSkeleton() {
  const tab = useSearchParams().get('tab')
  if (tab === 'billing') return <BillingSkeleton />
  return (
    <div className="space-y-4">
      <TabToolbarSkeleton />
      <ItemListSkeleton rows={3} />
    </div>
  )
}
