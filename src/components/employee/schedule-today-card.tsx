import Link from 'next/link'
import { ChevronRight, MapPin, Phone } from 'lucide-react'

import { ClockActions } from '@/components/employee/clock-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import StatusBadge, { appointmentStatusBadge, clockStatusBadge } from '@/components/ui/status-badge'
import { buildMapsUrl, formatTimeRange } from '@/lib/schedule'
import type { ScheduleStop } from '@/types/schedule'

export function ScheduleTodayCard({ stop }: { stop: ScheduleStop }) {
	const statusBadge = appointmentStatusBadge(stop.status)
	const youBadge = clockStatusBadge(stop.you.clockStatus, stop.you.clocked_in_at, stop.you.clocked_out_at)
	const hasAddress = Boolean(stop.address?.trim())
	const description = stop.jobDescription?.trim()

	return (
		<Card className="gap-3 border-l-2 border-primary text-sm transition-[box-shadow] duration-fast md:hover:ring-foreground/20">
			<CardHeader>
				<Link
					href={`/solutions/schedule/${stop.id}`}
					className="-mx-1 grid min-h-11 grid-cols-[1fr_auto] gap-x-2 gap-y-1 rounded-md px-1 py-1 transition-[background-color] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-muted md:hover:bg-muted"
				>
					<p className="font-mono text-sm tabular-nums text-foreground">
						{formatTimeRange(stop.scheduled_date, stop.scheduled_start_time, stop.scheduled_end_time)}
					</p>
					<ChevronRight className="row-span-3 size-5 self-center text-muted-foreground" aria-hidden="true" />
					<h3 className="text-base font-semibold break-words text-foreground">{stop.jobName}</h3>
					<p className="text-sm break-words text-muted-foreground">{stop.clientName}</p>
					<div className="col-span-2 flex flex-wrap gap-2 pt-1">
						<StatusBadge tone={statusBadge.tone} icon={statusBadge.icon}>
							{statusBadge.label}
						</StatusBadge>
						{/* Keyed on the status so the badge zooms in once when it changes after a clock action. */}
						<span key={stop.you.clockStatus} className="animate-in fade-in-0 zoom-in-95 duration-base ease-out-quart">
							<StatusBadge tone={youBadge.tone} icon={youBadge.icon}>
								{youBadge.label}
							</StatusBadge>
						</span>
					</div>
				</Link>
			</CardHeader>

			<CardContent>
				<ClockActions
					variant="inline"
					jobName={stop.jobName}
					appointmentEmployeeId={stop.assignmentId}
					appointmentStatus={stop.status}
					clockStatus={stop.you.clockStatus}
				/>
			</CardContent>

			<CardContent className="space-y-3">
				{description ? <p className="text-sm leading-6 break-words text-foreground">{description}</p> : null}
				{hasAddress ? <p className="text-sm break-words text-muted-foreground">{stop.address}</p> : null}
				{hasAddress ? (
					<Button
						variant="outline"
						nativeButton={false}
						className="w-full"
						render={<a href={buildMapsUrl(stop.address ?? '')} target="_blank" rel="noopener" />}
					>
						<MapPin aria-hidden="true" />
						Directions
					</Button>
				) : null}
			</CardContent>

			<CardContent className="space-y-1">
				<h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Crew ({stop.crew.length})</h4>
				<ul className="divide-y divide-border">
					{stop.crew.map((member) => {
						const isYou = member.id === stop.you.id
						const badge = clockStatusBadge(member.clockStatus, member.clocked_in_at, member.clocked_out_at)

						return (
							<li key={member.id} className="flex min-h-11 items-center gap-2 py-1">
								<span className="min-w-0 flex-1 text-sm font-medium break-words text-foreground">
									{member.full_name}
									{isYou ? (
										<Badge variant="secondary" className="ml-2">
											You
										</Badge>
									) : null}
								</span>
								{member.phone ? (
									<Button
										variant="ghost"
										size="icon"
										nativeButton={false}
										aria-label={`Call ${member.full_name}`}
										render={<a href={`tel:${member.phone}`} />}
									>
										<Phone aria-hidden="true" />
									</Button>
								) : (
									<span className="size-11 shrink-0" aria-hidden="true" />
								)}
								<StatusBadge tone={badge.tone} icon={badge.icon} className="shrink-0">
									{badge.label}
								</StatusBadge>
							</li>
						)
					})}
				</ul>
			</CardContent>
		</Card>
	)
}
