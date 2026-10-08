'use client'

import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function ProfileError({
    unstable_retry,
}: {
    error: Error & { digest?: string }
    unstable_retry: () => void
}) {
    return (
        <div className="mx-auto max-w-2xl space-y-4">
            <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>Couldn&apos;t load your profile</AlertTitle>
                <AlertDescription>Something went wrong on our side.</AlertDescription>
            </Alert>
            <Button variant="outline" onClick={() => unstable_retry()}>
                Try again
            </Button>
        </div>
    )
}
