'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { AppointmentFormLoadError } from '@/components/admin/appointment-form-load-error'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'

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
          className="-ml-3 transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] active:bg-muted"
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
