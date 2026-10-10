'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function InvoiceDetailError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('Invoice detail failed to render:', error)
  }, [error])

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load this invoice</AlertTitle>
        <AlertDescription>Something went wrong reading it. Try again.</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button className="active:scale-[0.98]" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Button
          variant="outline"
          className="active:scale-[0.98]"
          nativeButton={false}
          render={<Link href="/solutions/invoices" />}
        >
          Back to invoices
        </Button>
      </div>
    </div>
  )
}
