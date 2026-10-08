import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import StatusBadge, { appointmentStatusBadge, clockStatusBadge } from '@/components/ui/status-badge'
import { formatTimeRange } from '@/lib/schedule'
import type { ScheduleStop } from '@/types/schedule'

const STAGGER_STEP_MS = 40
const MAX_STAGGERED_ROWS = 7

type ScheduleRowProps = {
	stop: ScheduleStop
	index: number
	// Upcoming rows hide the (always "Not started") clock badge; Recent rows keep it to show missed clocks.
	shouldHideIdleClock: boolean
}

export function ScheduleRow({ stop, index, shouldHideIdleClock }: ScheduleRowProps) {
	const isCancelled = stop.status === 'cancelled'
	const isClockHidden = shouldHideIdleClock && stop.you.clockStatus === 'not_started'
	const clockBadge = clockStatusBadge(stop.you.clockStatus, stop.you.clocked_in_at, stop.you.clocked_out_at)
	const statusBadge = appointmentStatusBadge(stop.status)

	return (
		<Link
			href={`/solutions/schedule/${stop.id}`}
			className="flex min-h-16 items-center gap-3 rounded-lg px-3 py-2 transition-[background-color] animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-base ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-muted md:hover:bg-muted"
			style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_STEP_MS}ms` }}
		>
			<div className="min-w-0 flex-1">
				<p className="font-mono text-sm tabular-nums">
					{formatTimeRange(stop.scheduled_date, stop.scheduled_start_time, stop.scheduled_end_time)}
				</p>
				<p className="text-sm font-semibold break-words">{stop.jobName}</p>
				<p className="truncate text-sm text-muted-foreground">{stop.clientName}</p>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-1">
				{isCancelled ? (
					<StatusBadge tone={statusBadge.tone} icon={statusBadge.icon}>
						{statusBadge.label}
					</StatusBadge>
				) : null}
				{isClockHidden ? null : (
					<StatusBadge tone={clockBadge.tone} icon={clockBadge.icon}>
						{clockBadge.label}
					</StatusBadge>
				)}
			</div>
			<ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
		</Link>
	)
}
