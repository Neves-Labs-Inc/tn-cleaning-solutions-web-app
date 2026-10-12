import { Suspense } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import AppointmentsScreen from '@/components/admin/appointments-screen'
import AppointmentsScreenSkeleton from '@/components/admin/appointments-screen-skeleton'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import { getBusinessDate } from '@/lib/schedule'

// Reads no data: the screen reads through the admin layout's client cache, so coming Back shows
// what it already has instead of reading it all again.
export default function AppointmentsPage() {
  const businessDate = getBusinessDate(new Date())

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description="Plan, assign, and track appointments across your team."
        action={
          <Button
            className="w-full transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] sm:w-auto"
            nativeButton={false}
            render={<Link href="/solutions/appointments/new" />}
          >
            <Plus aria-hidden="true" />
            New appointment
          </Button>
        }
      />

      {/* The screen reads the URL's search params. */}
      <Suspense fallback={<AppointmentsScreenSkeleton />}>
        <AppointmentsScreen businessDate={businessDate} />
      </Suspense>
    </div>
  )
}
