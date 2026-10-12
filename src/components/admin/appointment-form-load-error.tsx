'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

type AppointmentFormLoadErrorProps = {
  title: string
  description: string
  onRetry?: () => void
}

// Shared by the pages (refresh) and error.tsx (unstable_retry), which differ only in how they retry.
export function AppointmentFormLoadError({
  title,
  description,
  onRetry,
}: AppointmentFormLoadErrorProps): React.ReactNode {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleRetry(): void {
    if (onRetry) {
      onRetry()
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <Alert
      variant="destructive"
      className="animate-in fade-in-0 duration-base ease-out-quart has-data-[slot=alert-action]:pr-3"
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="break-words">{description}</AlertDescription>
      <AlertAction className="static col-span-2 mt-2">
        <Button
          type="button"
          variant="outline"
          className="transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] active:bg-muted md:hover:bg-muted"
          disabled={isPending}
          aria-busy={isPending || undefined}
          onClick={handleRetry}
        >
          {/* Both layers share one cell, sized by the wider one, so the spinner never changes the width. */}
          <span className="grid">
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 flex items-center gap-1.5">
              <span className="size-4" />
              Try again
            </span>
            <span className="col-start-1 row-start-1 flex items-center justify-center gap-1.5">
              {isPending ? <Spinner className="size-4" /> : null}
              Try again
            </span>
          </span>
        </Button>
      </AlertAction>
    </Alert>
  )
}
