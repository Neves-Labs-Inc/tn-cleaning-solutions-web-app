'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import {
  AlertCircle,
  CheckCircle2,
  ClockCheck,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { AppointmentScopeChoice, ScopePreviewSlot, useScopePreview } from '@/components/admin/appointment-scope-choice'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import SubmitButton from '@/components/ui/submit-button'
import { useAppointmentsCache } from '@/hooks/use-appointments-cache'
import { cancelAppointments, deleteAppointments, type ScopePreviewData } from '@/lib/actions/appointment-scopes'
import {
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
  isCompletedByClocks,
  type AppointmentStatus,
} from '@/lib/appointments/lifecycle'
import type { AppointmentScope } from '@/lib/appointments/appointment-scope'

type AppointmentLifecycleActionsProps = {
  appointmentId: string
  status: AppointmentStatus
  manuallyCompleted: boolean
  editHref: string
  recurrenceSeriesId: string | null
  scheduledDate: string
}

type ActionError = { title: string; message: string }

type ActionCopy = {
  errorTitle: string
  successMessage: string
}

const COPY = {
  cancel: { errorTitle: "Couldn't cancel this appointment", successMessage: 'Appointment cancelled' },
  delete: { errorTitle: "Couldn't delete this appointment", successMessage: 'Appointment deleted' },
  restore: { errorTitle: "Couldn't restore this appointment", successMessage: 'Appointment restored' },
  markComplete: { errorTitle: "Couldn't mark this complete", successMessage: 'Marked complete' },
  undoComplete: { errorTitle: "Couldn't undo completion", successMessage: 'Completion undone' },
} satisfies Record<string, ActionCopy>

const CONNECTION_ERROR = 'Something went wrong. Check your connection and try again.'
const APPOINTMENTS_LIST_PATH = '/solutions/appointments'

function Count({ value }: { value: number }) {
  return <span className="font-medium tabular-nums">{value}</span>
}

// The preview sentence for a scoped cancel. N = 1 reads "this visit" only under "This visit":
// under a wider scope the one visit left may not be the chosen one.
export function cancelPreviewCopy(data: ScopePreviewData, scope: AppointmentScope): React.ReactNode {
  const { actCount, skippedCount } = data

  let lead: React.ReactNode = 'Nothing to cancel.'
  if (actCount === 1 && scope === 'occurrence') {
    lead = 'This cancels this visit.'
  } else if (actCount === 1) {
    lead = (
      <>
        This cancels <Count value={1} /> visit.
      </>
    )
  } else if (actCount > 1) {
    lead = (
      <>
        This cancels <Count value={actCount} /> visits.
      </>
    )
  }

  let skip: React.ReactNode = null
  if (skippedCount === 1) {
    skip = (
      <>
        {/* Explicit spaces: the compiled JSX dropped the plain one after the count. */}
        {' '}
        <Count value={1} />
        {" will be skipped because it's on a paid invoice. Void the invoice first to cancel it."}
      </>
    )
  } else if (skippedCount > 1) {
    skip = (
      <>
        {' '}
        <Count value={skippedCount} />
        {" will be skipped because they're on a paid invoice. Void the invoice first to cancel them."}
      </>
    )
  }

  return (
    <>
      {lead}
      {skip}
    </>
  )
}

function cancelToastMessage(cancelledCount: number, skippedCount: number): string {
  // A race (someone else cancelled them first) can leave nothing done and nothing skipped.
  if (cancelledCount === 0 && skippedCount === 0) return 'Nothing to cancel'
  if (skippedCount > 0) return `${cancelledCount} cancelled, ${skippedCount} skipped (on a paid invoice)`
  return cancelledCount === 1 ? COPY.cancel.successMessage : `${cancelledCount} visits cancelled`
}

// The preview for a scoped delete, ending with the "can't be undone" line.
export function deletePreviewCopy(data: ScopePreviewData, scope: AppointmentScope): React.ReactNode {
  const { actCount, skippedCount } = data

  if (actCount === 0) {
    const lead = 'Nothing to delete.'
    if (skippedCount === 1) return "Nothing to delete. This visit is on a paid invoice. Void the invoice first to delete it."
    if (skippedCount > 1) {
      return `Nothing to delete. All ${skippedCount} visits are on a paid invoice. Void the invoice first to delete them.`
    }
    return lead
  }

  const lead =
    actCount === 1 ? (
      'This permanently deletes this visit, with its clock times, time sheet corrections and invoice line.'
    ) : (
      <>
        This permanently deletes <Count value={actCount} />
        {' visits, with their clock times, time sheet corrections and invoice lines.'}
      </>
    )

  let skip: React.ReactNode = null
  if (skippedCount === 1) {
    skip = (
      <>
        {' '}
        <Count value={1} />
        {" will be skipped because it's on a paid invoice. Void the invoice first to delete it."}
      </>
    )
  } else if (skippedCount > 1) {
    skip = (
      <>
        {' '}
        <Count value={skippedCount} />
        {" will be skipped because they're on a paid invoice. Void the invoice first to delete them."}
      </>
    )
  }

  let seriesNote = ''
  if (scope === 'future') {
    seriesNote = ` The series will end on ${format(subDays(parseISO(data.chosenDate), 1), 'MMM d, yyyy')}.`
  } else if (scope === 'series') {
    seriesNote = ' The series is removed.'
  }

  return (
    <>
      <p>
        {lead}
        {skip}
        {seriesNote}
      </p>
      <p className="mt-1 font-medium text-destructive">{"This can't be undone."}</p>
    </>
  )
}

function deleteToastMessage(deletedCount: number, skippedCount: number): string {
  if (skippedCount > 0) return `${deletedCount} deleted, ${skippedCount} skipped (on a paid invoice)`
  return deletedCount === 1 ? COPY.delete.successMessage : `${deletedCount} visits deleted`
}

const HINT_TEXT = "Completed by admin. Clock changes won't change the status until you undo it."
const CLOCKS_HINT_TEXT = 'Completed by clocks. Change the clocks on the Time sheet to reopen.'

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

export function CompletedByClocksHint({
  status,
  manuallyCompleted,
}: Pick<AppointmentLifecycleActionsProps, 'status' | 'manuallyCompleted'>) {
  if (!isCompletedByClocks({ status, manually_completed: manuallyCompleted })) return null

  return (
    <p className="flex items-start gap-1.5 text-pretty text-sm text-muted-foreground animate-in fade-in-0 duration-base ease-out-quart">
      <ClockCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
      {CLOCKS_HINT_TEXT}
    </p>
  )
}

export default function AppointmentLifecycleActions({
  appointmentId,
  status,
  manuallyCompleted,
  editHref,
  recurrenceSeriesId,
  scheduledDate,
}: AppointmentLifecycleActionsProps) {
  const router = useRouter()
  const appointmentsCache = useAppointmentsCache()
  const [error, setError] = useState<ActionError | null>(null)
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [cancelScope, setCancelScope] = useState<AppointmentScope>('occurrence')
  const cancelPreview = useScopePreview({ appointmentId, scope: cancelScope, action: 'cancel', enabled: isCancelOpen })
  const isCancelConfirmDisabled = cancelPreview.status !== 'ready' || cancelPreview.data?.actCount === 0

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteScope, setDeleteScope] = useState<AppointmentScope>('occurrence')
  // A ref, not state: the confirm runs as a form action, so state set inside it commits only when it ends.
  const isDeletingRef = useRef(false)
  const deleteButtonRef = useRef<HTMLButtonElement>(null)
  // Set once the chosen visit is deleted; the effect below navigates away after the action ends.
  const [isChosenDeleted, setIsChosenDeleted] = useState(false)
  const deletePreview = useScopePreview({ appointmentId, scope: deleteScope, action: 'delete', enabled: isDeleteOpen })
  const isDeleteConfirmDisabled = deletePreview.status !== 'ready' || deletePreview.data?.actCount === 0

  // Navigating inside the form action lost the race: the action's own revalidation of this page
  // landed after the push and put the deleted page's 404 back. After the action commits, it sticks.
  useEffect(() => {
    if (isChosenDeleted) router.push(APPOINTMENTS_LIST_PATH)
  }, [isChosenDeleted, router])

  const lifecycle = { status, manually_completed: manuallyCompleted }
  const showEdit = canEdit(status)
  const showCancel = canCancel(status)
  // Without Edit the lifecycle button is alone in its row, so it fills it instead of sitting in half.
  const lifecycleSpan = !showEdit ? 'col-span-2 md:col-span-1' : ''
  const hasLifecycleButton = canMarkComplete(lifecycle) || canUndoComplete(lifecycle) || canRestore(status)
  // Edit alone in its row (a clock-completed visit) fills it, mirroring lifecycleSpan.
  const editSpan = hasLifecycleButton ? '' : 'col-span-2 md:col-span-1'

  async function run(copy: ActionCopy, action: (id: string) => Promise<AppointmentActionResult>) {
    setError(null)

    try {
      const result = await action(appointmentId)

      if (result.success) {
        void appointmentsCache.applyChanges([appointmentId])
        toast.success(copy.successMessage)
      } else {
        setError({ title: copy.errorTitle, message: result.error })
        // A refusal usually means this page is stale, so re-read the row behind it.
        router.refresh()
      }
    } catch (thrown) {
      console.error('Appointment action failed:', thrown)
      setError({ title: copy.errorTitle, message: CONNECTION_ERROR })
    }
  }

  function handleOpenCancel() {
    // "This visit" each time the dialog opens.
    setCancelScope('occurrence')
    setIsCancelOpen(true)
  }

  async function handleConfirmCancel() {
    setError(null)

    try {
      const result = await cancelAppointments(appointmentId, cancelScope)

      if (result.success) {
        const { ids, cancelledCount, skippedCount } = result.data
        void appointmentsCache.applyChanges(ids)
        toast.success(cancelToastMessage(cancelledCount, skippedCount))
      } else {
        setError({ title: COPY.cancel.errorTitle, message: result.error })
        router.refresh()
      }
    } catch (thrown) {
      console.error('Appointment action failed:', thrown)
      setError({ title: COPY.cancel.errorTitle, message: CONNECTION_ERROR })
    }
    setIsCancelOpen(false)
  }

  function handleOpenDelete() {
    setDeleteScope('occurrence')
    setIsDeleteOpen(true)
  }

  async function handleConfirmDelete() {
    setError(null)
    isDeletingRef.current = true
    let shouldClose = true

    try {
      const result = await deleteAppointments(appointmentId, deleteScope)

      if (result.success) {
        const { ids, deletedCount, skippedCount, chosenDeleted } = result.data
        void appointmentsCache.applyChanges(ids)
        toast.success(deleteToastMessage(deletedCount, skippedCount))
        if (chosenDeleted) {
          // This page is gone; the dialog unmounts with it.
          shouldClose = false
          setIsChosenDeleted(true)
        } else {
          router.refresh()
        }
      } else {
        setError({ title: COPY.delete.errorTitle, message: result.error })
        router.refresh()
      }
    } catch (thrown) {
      console.error('Appointment action failed:', thrown)
      setError({ title: COPY.delete.errorTitle, message: CONNECTION_ERROR })
      router.refresh()
    }
    isDeletingRef.current = false
    if (shouldClose) setIsDeleteOpen(false)
  }

  return (
    <div className="w-full space-y-3 lg:w-auto">
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center md:justify-end">
        {showEdit ? (
          <Button variant="outline" className={`w-full md:w-auto ${editSpan}`} render={<Link href={editHref} />} nativeButton={false}>
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
            onClick={handleOpenCancel}
          >
            <XCircle aria-hidden="true" />
            Cancel appointment
          </Button>
        ) : null}

        <Button
          ref={deleteButtonRef}
          type="button"
          variant="destructive"
          className="col-span-2 w-full md:col-span-1 md:w-auto"
          onClick={handleOpenDelete}
        >
          <Trash2 aria-hidden="true" />
          Delete appointment
        </Button>
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
        description={`${status === 'completed' ? 'This appointment is already completed. ' : ''}It's marked Cancelled and Cleaners can't clock in. Clock times are kept. You can restore it later.`}
        confirmLabel="Cancel appointment"
        pendingLabel="Cancelling…"
        keepLabel="Keep appointment"
        onConfirm={handleConfirmCancel}
        confirmDisabled={isCancelConfirmDisabled}
      >
        {recurrenceSeriesId ? (
          <AppointmentScopeChoice value={cancelScope} onValueChange={setCancelScope} chosenDate={scheduledDate} />
        ) : null}
        <ScopePreviewSlot preview={cancelPreview}>{(data) => cancelPreviewCopy(data, cancelScope)}</ScopePreviewSlot>
      </ConfirmDialog>

      <ConfirmDialog
        open={isDeleteOpen}
        // Drag, Esc and overlay clicks are ignored while the delete runs.
        onOpenChange={(open) => {
          if (!isDeletingRef.current) setIsDeleteOpen(open)
        }}
        title="Delete this appointment?"
        description="Deleting removes it from the schedule, the calendar and the Cleaners' time sheets."
        confirmLabel="Delete appointment"
        pendingLabel="Deleting…"
        keepLabel="Keep appointment"
        onConfirm={handleConfirmDelete}
        confirmDisabled={isDeleteConfirmDisabled}
        returnFocusRef={deleteButtonRef}
      >
        {recurrenceSeriesId ? (
          <AppointmentScopeChoice value={deleteScope} onValueChange={setDeleteScope} chosenDate={scheduledDate} />
        ) : null}
        <ScopePreviewSlot preview={deletePreview} minHeightClassName="min-h-[6.25rem] max-md:min-h-[7.75rem]">
          {(data) => deletePreviewCopy(data, deletePreview.dataScope ?? deleteScope)}
        </ScopePreviewSlot>
      </ConfirmDialog>
    </div>
  )
}
