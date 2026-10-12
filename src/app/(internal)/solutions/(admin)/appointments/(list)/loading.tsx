import AppointmentsScreenSkeleton from '@/components/admin/appointments-screen-skeleton'
import { Skeleton } from '@/components/ui/skeleton'

// Mirrors the loaded page: the header, then the screen's own skeleton.
export default function AppointmentsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-full sm:w-44" />
      </div>

      <AppointmentsScreenSkeleton />
    </div>
  )
}
