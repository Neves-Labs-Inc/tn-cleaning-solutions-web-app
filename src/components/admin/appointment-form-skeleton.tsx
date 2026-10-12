import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type AppointmentFormSkeletonProps = {
  mode: 'new' | 'edit'
}

const CONTEXT_ROW_KEYS = ['first', 'second', 'third', 'fourth']

// Label (h-5) and gap (space-y-2) match the real Field so controls land on the same pixel.
function SkeletonField({ labelWidth, children }: { labelWidth: string; children?: React.ReactNode }): React.ReactNode {
  return (
    <div className="min-w-0 space-y-2">
      <Skeleton className={`h-5 ${labelWidth}`} />
      {children ?? <Skeleton className="h-(--control-height) w-full" />}
    </div>
  )
}

// Mirrors the page header, the schedule trigger/side column and the form card so nothing jumps when it loads.
export function AppointmentFormSkeleton({ mode }: AppointmentFormSkeletonProps): React.ReactNode {
  const isEdit = mode === 'edit'

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <div className="space-y-3">
        <Skeleton className="-ml-3 h-(--control-height) w-36" />
        <div className="space-y-1">
          <Skeleton className="h-8 w-56 sm:h-9" />
          <Skeleton className="h-5 w-72 max-w-full" />
          {isEdit ? <Skeleton className="h-5 w-40" /> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] lg:items-stretch">
        <div className="lg:hidden">
          <Skeleton className="h-(--control-height) w-full" />
        </div>

        <Card className="hidden lg:flex">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-(--control-height)" />
              <Skeleton className="h-(--control-height)" />
            </div>
            {isEdit ? <Skeleton className="h-(--control-height) w-full" /> : null}
            {CONTEXT_ROW_KEYS.map((key) => (
              <Skeleton key={key} className="h-16 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>

        <section className="rounded-lg bg-card p-4 text-card-foreground shadow-sm ring-1 ring-foreground/10 sm:p-5">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <SkeletonField labelWidth="w-16" />
              <SkeletonField labelWidth="w-20" />
            </div>
            <SkeletonField labelWidth="w-12" />
            <div className="grid gap-4 sm:grid-cols-3">
              <SkeletonField labelWidth="w-12" />
              <SkeletonField labelWidth="w-16" />
              <SkeletonField labelWidth="w-16" />
            </div>
            {/* Calculated total panel: label (20px), formula (leading-6, 24px), caption (text-xs, 16px). */}
            <div className="space-y-1 rounded-lg border border-border p-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-6 w-64 max-w-full" />
              <Skeleton className="h-4 w-36" />
            </div>
            <SkeletonField labelWidth="w-24">
              <Skeleton className="h-(--control-height) w-full" />
              <Skeleton className="h-4 w-48 max-w-full" />
            </SkeletonField>
            <SkeletonField labelWidth="w-20" />
            <SkeletonField labelWidth="w-12">
              <Skeleton className="h-28 w-full" />
            </SkeletonField>
            {isEdit ? null : (
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex min-h-11 items-center gap-3">
                  <Skeleton className="size-5" />
                  <Skeleton className="h-4 w-56 max-w-full" />
                </div>
              </div>
            )}

            <div className="sticky bottom-0 z-30 -mx-4 -mb-4 space-y-2 rounded-b-lg border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5 md:static md:mx-0 md:mb-0 md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 md:flex md:justify-end">
                <Skeleton className="h-(--control-height) w-24" />
                <Skeleton className="h-12 w-full md:w-44" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
