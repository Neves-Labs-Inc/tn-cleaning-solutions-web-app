'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { AppointmentFormLoadError } from '@/components/admin/appointment-form-load-error'
import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

export default function EditAppointmentError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <div className="space-y-3">
        <Button
          variant="ghost"
          className={cn(OUTLINE_PRESS_CLASS_NAME, '-ml-3')}
          nativeButton={false}
          render={<Link href={`/solutions/appointments/${id}`} />}
        >
          <ArrowLeft aria-hidden="true" />
          Appointment
        </Button>
        <PageHeader title="Edit appointment" description="Update schedule details and team assignments." />
      </div>
      <AppointmentFormLoadError
        title="Couldn't load this appointment"
        description="Something went wrong loading the appointment and its details. Try again."
        onRetry={unstable_retry}
      />
    </div>
  )
}
