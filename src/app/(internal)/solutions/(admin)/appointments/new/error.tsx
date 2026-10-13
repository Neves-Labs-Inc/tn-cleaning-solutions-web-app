'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { AppointmentFormLoadError } from '@/components/admin/appointment-form-load-error'
import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import { cn } from '@/lib/utils'

export default function NewAppointmentError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <div className="space-y-3">
        <Button
          variant="ghost"
          className={cn(OUTLINE_PRESS_CLASS_NAME, '-ml-3')}
          nativeButton={false}
          render={<Link href="/solutions/appointments" />}
        >
          <ArrowLeft aria-hidden="true" />
          Appointments
        </Button>
        <PageHeader title="New appointment" description="Create a one-time or recurring appointment." />
      </div>
      <AppointmentFormLoadError
        title="Couldn't load the appointment form"
        description="Something went wrong loading clients, jobs and the crew. Try again."
        onRetry={unstable_retry}
      />
    </div>
  )
}
