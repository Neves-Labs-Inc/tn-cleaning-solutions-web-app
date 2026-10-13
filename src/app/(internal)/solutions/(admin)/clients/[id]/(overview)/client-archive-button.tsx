'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Archive, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import SubmitButton from '@/components/ui/submit-button'
import { useAppointmentsCache } from '@/hooks/use-appointments-cache'
import { archiveClient, restoreClient, type ClientActionResult } from '@/lib/actions/clients'
import { appointmentsKeys } from '@/lib/appointments/appointments-keys'

type ClientArchiveButtonProps = {
  clientId: string
  clientName: string
  isArchived: boolean
}

// Archive (behind a confirm) or Restore (straight away). One button element in both states, so the DOM
// node survives router.refresh() and focus stays on it after the switch.
export function ClientArchiveButton({ clientId, clientName, isArchived }: ClientArchiveButtonProps): React.ReactNode {
  const router = useRouter()
  const appointmentsCache = useAppointmentsCache()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  // Covers the restore and the refresh after either change, so the button can't run a change twice
  // while the page still shows the old state.
  const [isPending, startPending] = useTransition()

  // True when the change saved. A throw (network, server) reads as a failure; the action logs nothing for it.
  async function runChange(change: (id: string) => Promise<ClientActionResult>): Promise<boolean> {
    let isSaved = false
    try {
      const result = await change(clientId)
      isSaved = result.success
    } catch (error) {
      console.error('Client archive state change failed', clientId, error)
    }

    if (isSaved) {
      // The Client filter lists only active clients, so it needs the new set.
      void appointmentsCache.refresh([appointmentsKeys.filterOptions])
      // A transition again after the await, so isPending holds until the refreshed page lands.
      startPending(() => router.refresh())
    }
    return isSaved
  }

  async function handleConfirmArchive(): Promise<void> {
    const isSaved = await runChange(archiveClient)
    setIsConfirmOpen(false)
    if (isSaved) {
      toast.success(`${clientName} archived`)
    } else {
      toast.error(`Couldn't archive ${clientName}. Try again.`)
    }
  }

  function handleClick(): void {
    if (isPending) return
    if (!isArchived) {
      setIsConfirmOpen(true)
      return
    }

    startPending(async () => {
      const isSaved = await runChange(restoreClient)
      if (isSaved) {
        toast.success(`${clientName} restored`)
      } else {
        toast.error(`Couldn't restore ${clientName}. Try again.`)
      }
    })
  }

  return (
    <>
      {/* Not inside a form, so its submit type does nothing: the click handler drives both states. */}
      <SubmitButton
        variant="outline"
        className={OUTLINE_PRESS_CLASS_NAME}
        label={isArchived ? 'Restore' : 'Archive'}
        pendingLabel={isArchived ? 'Restoring…' : 'Archiving…'}
        icon={isArchived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
        isPending={isPending}
        // aria-disabled instead of native disabled while pending: a disabled button drops focus to <body>.
        focusableWhenDisabled
        onClick={handleClick}
      />
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={`Archive ${clientName}?`}
        description="They'll be hidden from the active client list and pickers. Their appointments and invoices stay."
        confirmLabel="Archive client"
        pendingLabel="Archiving…"
        keepLabel="Keep client"
        onConfirm={handleConfirmArchive}
      />
    </>
  )
}
