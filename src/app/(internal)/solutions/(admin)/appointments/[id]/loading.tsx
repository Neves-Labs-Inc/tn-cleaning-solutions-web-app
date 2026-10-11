import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const CREW_ROW_KEYS = ['first', 'second']
const BILLING_STEP_KEYS = ['completed', 'billed', 'paid']
const BILLING_ACTION_KEYS = ['primary', 'secondary']

// Mirrors the detail page's header and two-column body so nothing jumps when it loads.
export default function AppointmentDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <Skeleton className="-ml-3 h-(--control-height) w-36" />
          <Skeleton className="h-8 w-64 sm:h-9" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>

        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap md:items-center md:justify-end">
          <Skeleton className="h-11 md:h-9 md:w-24" />
          <Skeleton className="h-11 md:h-9 md:w-24" />
          <Skeleton className="col-span-2 h-11 md:col-span-1 md:h-9 md:w-24" />
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Skeleton className="h-64" />
          <Card className="gap-0 py-0">
            <div className="space-y-2 p-4 sm:p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <ul className="divide-y border-t">
              {CREW_ROW_KEYS.map((key) => (
                <li key={key} className="space-y-3 p-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                  <Skeleton className="h-11 w-full" />
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="gap-4 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="space-y-3">
              {BILLING_STEP_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
            <Skeleton className="h-4 w-full" />
            <div className="flex flex-col gap-2">
              {BILLING_ACTION_KEYS.map((key) => (
                <Skeleton key={key} className="h-11 w-full md:h-9" />
              ))}
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}
