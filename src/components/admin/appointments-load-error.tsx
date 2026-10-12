'use client'

import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

type AppointmentsLoadErrorProps = {
  onRetry: () => void
  isRetrying?: boolean
}

// Stands in for the tiles and the schedule together, so no tile shows a partial total.
export default function AppointmentsLoadError({
  onRetry,
  isRetrying = false,
}: AppointmentsLoadErrorProps): React.ReactNode {
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
        disabled={isRetrying}
        aria-busy={isRetrying || undefined}
        onClick={onRetry}
      >
        {/* Both layers share one cell, sized by the wider one, so the spinner never changes the width. */}
        <span className="grid">
          <span aria-hidden="true" className="invisible col-start-1 row-start-1 flex items-center gap-1.5">
            <span className="size-4" />
            Try again
          </span>
          <span className="col-start-1 row-start-1 flex items-center justify-center gap-1.5">
            {isRetrying ? <Spinner className="size-4" /> : null}
            Try again
          </span>
        </span>
      </Button>
    </div>
  )
}
