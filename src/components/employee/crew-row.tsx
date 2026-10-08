import { Phone } from 'lucide-react'

import { Button } from '@/components/ui/button'
import StatusBadge, { clockStatusBadge } from '@/components/ui/status-badge'
import type { ClockStatus } from '@/lib/schedule'

export type CrewMember = {
	id: string
	full_name: string
	phone: string | null
	clocked_in_at: string | null
	clocked_out_at: string | null
	clockStatus: ClockStatus
}

export function CrewRow({ member, isCurrentUser }: { member: CrewMember; isCurrentUser: boolean }) {
	const clockBadge = clockStatusBadge(member.clockStatus, member.clocked_in_at, member.clocked_out_at)

	return (
		<li className="flex min-h-16 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
			<div className="flex min-w-0 flex-col gap-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium wrap-anywhere text-foreground">{member.full_name}</span>
					{isCurrentUser ? <StatusBadge tone="info">You</StatusBadge> : null}
				</div>
				{member.phone ? (
					<Button
						variant="ghost"
						size="sm"
						className="-ml-3 min-h-11 self-start active:scale-[0.98] active:bg-muted"
						render={<a href={`tel:${member.phone}`} />}
						nativeButton={false}
					>
						<Phone aria-hidden="true" />
						{member.phone}
					</Button>
				) : (
					<p className="text-sm text-muted-foreground">No phone on file</p>
				)}
			</div>
			<StatusBadge tone={clockBadge.tone} icon={clockBadge.icon} className="self-start sm:self-auto">
				{clockBadge.label}
			</StatusBadge>
		</li>
	)
}
