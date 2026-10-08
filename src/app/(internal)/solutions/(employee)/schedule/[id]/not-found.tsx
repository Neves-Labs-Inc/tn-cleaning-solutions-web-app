import Link from 'next/link'
import { ArrowLeft, MapPinOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export default function AppointmentNotFound() {
	return (
		<Empty className="min-h-[60vh]">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<MapPinOff aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle className="text-lg font-semibold tracking-tight">This stop isn&apos;t on your schedule</EmptyTitle>
				<EmptyDescription className="text-sm">It may have been reassigned or the link is out of date.</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button size="lg" className="active:scale-[0.98]" render={<Link href="/solutions/schedule" />} nativeButton={false}>
					<ArrowLeft aria-hidden="true" />
					Back to Schedule
				</Button>
			</EmptyContent>
		</Empty>
	)
}
