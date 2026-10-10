'use client'

import Link from 'next/link'
import { AlertCircle, ArrowLeft } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'

export default function NewInvoiceError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" className="-ml-3" nativeButton={false} render={<Link href="/solutions/invoices" />}>
          <ArrowLeft aria-hidden="true" />
          Invoices
        </Button>
        <PageHeader
          title="New invoice"
          description="Pick a client, then the visits to bill. Visits up to today start checked."
        />
      </div>
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load visits to bill</AlertTitle>
        <AlertDescription>Something went wrong loading clients and prices. Try again.</AlertDescription>
      </Alert>
      <Button variant="outline" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </div>
  )
}
