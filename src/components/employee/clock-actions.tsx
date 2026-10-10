'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { CheckCircle2, CircleAlert, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Spinner } from '@/components/ui/spinner'
import { clockIn, clockOut, type ClockActionState } from '@/lib/actions/attendance'
import { formatBusinessTime } from '@/lib/schedule'
import { CLOCK_BLOCKED_MESSAGES } from '@/lib/appointments/clock-messages'
import { canClockIn, type AppointmentStatus } from '@/lib/appointments/lifecycle'

type ClockStatus = 'clocked_in' | 'clocked_out' | 'not_started'
type ClockActionsProps = {
	appointmentEmployeeId: string
	clockStatus: ClockStatus
	appointmentStatus: AppointmentStatus
	manuallyCompleted: boolean
	jobName?: string
	variant?: 'inline' | 'bar'
}

const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Check your connection and try again."

// The Work completed box renders after the refresh lands; wait out the sheet's 140ms exit so the
// focus trap has released.
const FOCUS_RETURN_DELAY_MS = 200

// Both variants are w-full with no margin; the bar's padding comes from its sticky wrapper.
const ROOT_CLASSES: Record<NonNullable<ClockActionsProps['variant']>, string> = {
	inline: 'w-full space-y-3',
	bar: 'w-full space-y-3',
}

function getBlockedMessage(canClockInHere: boolean, status: AppointmentStatus): string | null {
	if (canClockInHere) return null
	return status === 'cancelled' ? CLOCK_BLOCKED_MESSAGES.cancelled : CLOCK_BLOCKED_MESSAGES.manuallyCompleted
}

export function ClockActions({ appointmentEmployeeId, clockStatus, appointmentStatus, manuallyCompleted, jobName, variant = 'inline' }: ClockActionsProps) {
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [error, setError] = useState<string | null>(null)
	const [isDrawerOpen, setIsDrawerOpen] = useState(false)
	const clockOutButtonRef = useRef<HTMLButtonElement>(null)
	const completedRef = useRef<HTMLDivElement>(null)
	const previousClockStatusRef = useRef(clockStatus)

	const noticeId = useId()

	const canClockInHere = canClockIn({ status: appointmentStatus, manually_completed: manuallyCompleted })
	// Picking the copy by status is not a status rule; availability comes from canClockIn alone.
	const blockedMessage = getBlockedMessage(canClockInHere, appointmentStatus)
	// Clocking out always works, so the notice only shows when no action is left to explain.
	const noticeMessage = clockStatus === 'clocked_in' ? null : blockedMessage
	// After a refused clock-in the refresh brings the notice, which says the same thing as the inline
	// error, so the error yields to it.
	const shownError = noticeMessage && error === noticeMessage ? null : error
	const isClockInBlocked = !canClockInHere

	// Fires when the sheet unmounts for every close path (vaul's onAnimationEnd and onOpenChange skip the
	// programmatic close), and replaces Radix's default return to a trigger this drawer does not have.
	const handleDrawerCloseAutoFocus = (event: Event) => {
		event.preventDefault()
		;(completedRef.current ?? clockOutButtonRef.current)?.focus()
	}

	// The Clock Out button unmounts on success, so the "Work completed" box takes focus once it renders.
	useEffect(() => {
		const hasJustClockedOut = previousClockStatusRef.current === 'clocked_in' && clockStatus === 'clocked_out'
		previousClockStatusRef.current = clockStatus
		if (!hasJustClockedOut) return

		const timer = setTimeout(() => completedRef.current?.focus(), FOCUS_RETURN_DELAY_MS)
		return () => clearTimeout(timer)
	}, [clockStatus])

	const runClockAction = (action: (id: string) => Promise<ClockActionState>, getSuccessMessage: () => string) => {
		setError(null)
		startTransition(async () => {
			let result: ClockActionState
			try {
				result = await action(appointmentEmployeeId)
			} catch {
				// A rejected call (e.g. network drop) must surface inline, not hit the error boundary.
				result = { error: NETWORK_ERROR_MESSAGE }
			}

			setIsDrawerOpen(false)
			// Refresh on every outcome: a dropped connection may have committed, and a refused clock
			// means this screen is stale (an admin closed the appointment), so the server state must
			// replace it. The inline error is local state and survives the refresh.
			router.refresh()
			if (result.error) {
				setError(result.error)
				return
			}

			toast.success(getSuccessMessage())
		})
	}

	const handleClockIn = () => runClockAction(clockIn, () => `Clocked in at ${formatBusinessTime(new Date())}`)
	const handleConfirmClockOut = () => runClockAction(clockOut, () => 'Clocked out')

	const handleDrawerOpenChange = (isOpen: boolean) => {
		// An in-flight clock-out must not be abandoned by a drag or overlay tap.
		if (isPending) return
		setIsDrawerOpen(isOpen)
	}

	return (
		<div className={ROOT_CLASSES[variant]}>
			{clockStatus === 'not_started' ? (
				<Button type="button" size="lg" className="w-full" onClick={handleClockIn} disabled={isPending || isClockInBlocked} aria-busy={isPending} aria-describedby={isClockInBlocked ? noticeId : undefined}>
					{isPending ? <Spinner className="size-5" /> : <Clock aria-hidden="true" />}
					{isPending ? 'Clocking in…' : 'Clock In'}
				</Button>
			) : null}

			{clockStatus === 'clocked_in' ? (
				<Button ref={clockOutButtonRef} type="button" size="lg" variant="secondary" className="w-full" onClick={() => setIsDrawerOpen(true)}>
					<CheckCircle2 aria-hidden="true" />
					Clock Out
				</Button>
			) : null}

			{clockStatus === 'clocked_out' ? (
				<div
					ref={completedRef}
					tabIndex={-1}
					role="status"
					className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-border bg-muted text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					<CheckCircle2 className="size-4 text-muted-foreground" aria-hidden="true" />
					Work completed
				</div>
			) : null}

			{shownError ? (
				<Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
					<CircleAlert aria-hidden="true" />
					<AlertTitle className="font-medium">{shownError}</AlertTitle>
				</Alert>
			) : null}

			{noticeMessage ? (
				<p id={noticeId} className="text-sm text-muted-foreground">
					{noticeMessage}
				</p>
			) : null}

			<Drawer open={isDrawerOpen} onOpenChange={handleDrawerOpenChange} dismissible={!isPending} autoFocus>
				<DrawerContent className="sm:mx-auto sm:max-w-md" onCloseAutoFocus={handleDrawerCloseAutoFocus}>
					<DrawerHeader>
						<DrawerTitle>Confirm Clock out?</DrawerTitle>
						<DrawerDescription>
							{jobName ? `You can't clock back in to ${jobName} after clocking out.` : "You can't clock back in after clocking out."}
						</DrawerDescription>
					</DrawerHeader>
					<DrawerFooter className="grid grid-cols-2 gap-2 pb-[calc(1rem+var(--safe-bottom))]">
						<Button type="button" size="lg" variant="outline" className="w-full" onClick={() => setIsDrawerOpen(false)} disabled={isPending}>
							Cancel
						</Button>
						<Button type="button" size="lg" variant="default" className="w-full" onClick={handleConfirmClockOut} disabled={isPending} aria-busy={isPending}>
							{isPending ? <Spinner className="size-5" /> : null}
							{isPending ? 'Clocking out…' : 'Confirm'}
						</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>
		</div>
	)
}
