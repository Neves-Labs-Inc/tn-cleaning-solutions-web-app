'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function ReceivablesError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('Receivables failed to render:', error)
  }, [error])

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load receivables</AlertTitle>
        <AlertDescription>The totals and lists didn&apos;t load. Try again in a moment.</AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </div>
  )
}
