'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { AlertCircle, CalendarCheck, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import ResponsiveDialog from '@/components/ui/responsive-dialog'
import SubmitButton from '@/components/ui/submit-button'
import type { ClaimableVisit } from '@/lib/invoices/queries'

import { ClaimableVisitList } from './claimable-visit-list'
import { CONNECTION_ERROR_MESSAGE, useInvoiceDetail, type DraftDetails } from './invoice-detail-context'
import { SHEET_BUTTON_CLASS, SheetButtons } from './sheet-buttons'
import { submitDraftUpdate } from './submit-draft-update'

type AddVisitsPickerProps = {
  invoiceId: string
  clientName: string
  visits: ClaimableVisit[]
  businessDate: string
  savedDetails: DraftDetails
}

const ERROR_TITLE = "Couldn't add those visits"

function visitCount(count: number): string {
  return `${count} visit${count === 1 ? '' : 's'}`
}

export default function AddVisitsPicker({
  invoiceId,
  clientName,
  visits,
  businessDate,
  savedDetails,
}: AddVisitsPickerProps) {
  const router = useRouter()
  const { showPageError } = useInvoiceDetail()
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Visits that left the list since the page loaded can't stay checked.
  const chosenIds = visits.filter((visit) => selected.has(visit.id)).map((visit) => visit.id)
  const listedSelection = new Set(chosenIds)

  function handleOpen() {
    // Nothing starts checked.
    setSelected(new Set())
    setError(null)
    setIsOpen(true)
  }

  // Shown in the sheet, and in the page slot too: a refusal re-renders the page, and a draft issued
  // or archived elsewhere unmounts this picker with it.
  function showError(message: string) {
    setError(message)
    showPageError({ title: ERROR_TITLE, message })
  }

  async function handleSubmit() {
    setError(null)
    showPageError(null)

    try {
      const result = await submitDraftUpdate({ invoiceId, addIds: chosenIds, details: savedDetails })
      if (result.success) {
        toast.success(`Added ${visitCount(chosenIds.length)}`)
        setIsOpen(false)
        return
      }
      showError(result.error)
      // A visit claimed elsewhere drops out of the list once the page is re-read.
      router.refresh()
    } catch (thrown) {
      console.error('Add visits failed:', thrown)
      showError(CONNECTION_ERROR_MESSAGE)
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        className="w-full cursor-pointer transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] md:w-auto"
        onClick={handleOpen}
      >
        <Plus aria-hidden="true" />
        Add visits
      </Button>

      <ResponsiveDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        isPending={isPending}
        returnFocusRef={triggerRef}
        title="Add visits"
        description={`${clientName}'s visits that aren't on another invoice. Upcoming visits are billed ahead.`}
      >
        {visits.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No visits to add</EmptyTitle>
              <EmptyDescription>Every visit for {clientName} is already on an invoice or cancelled.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <ClaimableVisitList
              visits={visits}
              selected={listedSelection}
              onSelectedChange={setSelected}
              businessDate={businessDate}
              isInSheet
            />
            {/* Pinned to the sheet's bottom edge, over the drawer body's safe-area padding, so no row shows beneath it. */}
            <div className="sticky bottom-[calc(-1rem-var(--safe-bottom))] z-20 space-y-3 bg-popover pt-2 pb-[calc(1rem+var(--safe-bottom))] md:bottom-0 md:pb-1">
              {error ? (
                <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>{ERROR_TITLE}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <SheetButtons onCancel={() => setIsOpen(false)} onPendingChange={setIsPending}>
                <SubmitButton
                  label={chosenIds.length === 0 ? 'Add visits' : `Add ${visitCount(chosenIds.length)}`}
                  pendingLabel="Adding…"
                  disabled={chosenIds.length === 0}
                  className={SHEET_BUTTON_CLASS}
                />
              </SheetButtons>
            </div>
          </form>
        )}
      </ResponsiveDialog>
    </>
  )
}
