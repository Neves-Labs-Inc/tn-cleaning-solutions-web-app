'use client'

import { CircleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

// unstable_retry re-fetches the server component; reset() would only re-render the failed tree.
export default function AppointmentError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
	return (
		<div className="mx-auto max-w-2xl space-y-4">
			<Alert variant="destructive">
				<CircleAlert aria-hidden="true" />
				<AlertTitle>Couldn&apos;t load this appointment</AlertTitle>
				<AlertDescription>Check your connection and try again.</AlertDescription>
			</Alert>
			<Button variant="outline" className="active:scale-[0.98]" onClick={() => unstable_retry()}>
				Try again
			</Button>
		</div>
	)
}
