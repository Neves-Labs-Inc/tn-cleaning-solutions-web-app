'use client'

import { AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type AppointmentsLoadErrorProps = {
  // Defaults to re-reading the page.
  onRetry?: () => void
}

// Stands in for the tiles and the schedule together, so no tile shows a partial total.
export default function AppointmentsLoadError({ onRetry }: AppointmentsLoadErrorProps): React.ReactNode {
  const router = useRouter()

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load appointments</AlertTitle>
        <AlertDescription>
          Something went wrong loading the schedule or its billing. Try again in a moment.
        </AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]"
        onClick={() => (onRetry ? onRetry() : router.refresh())}
      >
        Try again
      </Button>
    </div>
  )
}
