'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export default function ScheduleError({
	error,
	unstable_retry,
}: {
	error: Error & { digest?: string }
	unstable_retry: () => void
}) {
	useEffect(() => {
		console.error('Schedule failed to render:', error)
	}, [error])

	return (
		<div className="space-y-4">
			<Alert variant="destructive" className="text-sm">
				<AlertCircle aria-hidden="true" />
				<AlertTitle>Couldn&apos;t load your schedule</AlertTitle>
				<AlertDescription className="text-sm">
					We could not load your assignments right now. Please try again in a moment or contact admin if the problem continues.
				</AlertDescription>
			</Alert>
			<Button variant="outline" onClick={() => unstable_retry()}>
				Try again
			</Button>
		</div>
	)
}
