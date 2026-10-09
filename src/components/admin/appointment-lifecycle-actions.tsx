'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AlertCircle, CheckCircle2, Pencil, RotateCcw, Undo2, UserCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import SubmitButton from '@/components/ui/submit-button'
import {
  cancelAppointment,
  markAppointmentComplete,
  restoreAppointment,
  undoAppointmentComplete,
  type AppointmentActionResult,
} from '@/lib/actions/appointments'
import {
  canCancel,
  canEdit,
  canMarkComplete,
  canRestore,
  canUndoComplete,
  type AppointmentStatus,
} from '@/lib/appointments/lifecycle'

type AppointmentLifecycleActionsProps = {
  appointmentId: string
  status: AppointmentStatus
  manuallyCompleted: boolean
  editHref: string
}

type ActionError = { title: string; message: string }

type ActionCopy = {
  errorTitle: string
  successMessage: string
}

const COPY = {
  cancel: { errorTitle: "Couldn't cancel this appointment", successMessage: 'Appointment cancelled' },
  restore: { errorTitle: "Couldn't restore this appointment", successMessage: 'Appointment restored' },
  markComplete: { errorTitle: "Couldn't mark this complete", successMessage: 'Marked complete' },
  undoComplete: { errorTitle: "Couldn't undo completion", successMessage: 'Completion undone' },
} satisfies Record<string, ActionCopy>

const HINT_TEXT = "Completed by admin. Clock changes won't change the status until you undo it."

// A cancelled row keeps its flag, but the hint would be noise next to a Cancelled badge.
export function CompletedByAdminHint({
  status,
  manuallyCompleted,
}: Pick<AppointmentLifecycleActionsProps, 'status' | 'manuallyCompleted'>) {
  if (!canUndoComplete({ status, manually_completed: manuallyCompleted })) return null

  return (
    <p className="flex items-start gap-1.5 text-pretty text-sm text-muted-foreground animate-in fade-in-0 duration-base ease-out-quart">
      <UserCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
      {HINT_TEXT}
    </p>
  )
}

export default function AppointmentLifecycleActions({
  appointmentId,
  status,
  manuallyCompleted,
  editHref,
}: AppointmentLifecycleActionsProps) {
  const router = useRouter()
  const [error, setError] = useState<ActionError | null>(null)
  const [isCancelOpen, setIsCancelOpen] = useState(false)

  const lifecycle = { status, manually_completed: manuallyCompleted }
  const showEdit = canEdit(status)
  const showCancel = canCancel(status)
  // Without Edit the lifecycle button is alone in its row, so it fills it instead of sitting in half.
  const lifecycleSpan = !showEdit ? 'col-span-2 md:col-span-1' : ''

  async function run(copy: ActionCopy, action: (id: string) => Promise<AppointmentActionResult>) {
    setError(null)

    try {
      const result = await action(appointmentId)

      if (result.success) {
        toast.success(copy.successMessage)
      } else {
        setError({ title: copy.errorTitle, message: result.error })
        // A refusal usually means this page is stale, so re-read the row behind it.
        router.refresh()
      }
    } catch (thrown) {
      console.error('Appointment action failed:', thrown)
      setError({ title: copy.errorTitle, message: 'Something went wrong. Check your connection and try again.' })
    }
  }

  async function handleConfirmCancel() {
    await run(COPY.cancel, cancelAppointment)
    setIsCancelOpen(false)
  }

  return (
    <div className="w-full space-y-3 lg:w-auto">
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end">
        {showEdit ? (
          <Button variant="outline" className="w-full md:w-auto" render={<Link href={editHref} />} nativeButton={false}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : null}

        {canMarkComplete(lifecycle) ? (
          <form action={() => run(COPY.markComplete, markAppointmentComplete)} className={lifecycleSpan}>
            <SubmitButton
              variant="outline"
              className="w-full md:w-auto"
              icon={<CheckCircle2 aria-hidden="true" />}
              label="Mark complete"
              pendingLabel="Marking…"
            />
          </form>
        ) : null}

        {canUndoComplete(lifecycle) ? (
          <form action={() => run(COPY.undoComplete, undoAppointmentComplete)} className={lifecycleSpan}>
            <SubmitButton
              variant="outline"
              className="w-full md:w-auto"
              icon={<Undo2 aria-hidden="true" />}
              label="Undo complete"
              pendingLabel="Undoing…"
            />
          </form>
        ) : null}

        {canRestore(status) ? (
          <form action={() => run(COPY.restore, restoreAppointment)} className={lifecycleSpan}>
            <SubmitButton
              className="w-full md:w-auto"
              icon={<RotateCcw aria-hidden="true" />}
              label="Restore"
              pendingLabel="Restoring…"
            />
          </form>
        ) : null}

        {showCancel ? (
          <Button
            type="button"
            variant="destructive"
            className="col-span-2 w-full md:col-span-1 md:w-auto"
            onClick={() => setIsCancelOpen(true)}
          >
            <XCircle aria-hidden="true" />
            Cancel appointment
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive" className="lg:ml-auto lg:max-w-md animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <ConfirmDialog
        open={isCancelOpen}
        onOpenChange={setIsCancelOpen}
        title="Cancel this appointment?"
        description={`${status === 'completed' ? 'This visit is already completed. ' : ''}It's marked Cancelled and Cleaners can't clock in. Clock times are kept. You can restore it later.`}
        confirmLabel="Cancel appointment"
        pendingLabel="Cancelling…"
        keepLabel="Keep appointment"
        onConfirm={handleConfirmCancel}
      />
    </div>
  )
}
