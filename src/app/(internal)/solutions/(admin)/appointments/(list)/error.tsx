'use client'

import { useEffect } from 'react'

import AppointmentsLoadError from '@/components/admin/appointments-load-error'

export default function AppointmentsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('Appointments failed to render:', error)
  }, [error])

  return <AppointmentsLoadError onRetry={unstable_retry} />
}
