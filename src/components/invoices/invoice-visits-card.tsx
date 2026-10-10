'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { AlertCircle, CircleAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import { Spinner } from '@/components/ui/spinner'
import { claimableStates } from '@/lib/invoices/lines'
import type { ClaimableVisit, InvoiceDetailLine } from '@/lib/invoices/queries'
import { formatDateOnly, type InvoiceStatus, type LineState } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

import AddVisitsPicker from './add-visits-picker'
import { CONNECTION_ERROR_MESSAGE, useInvoiceDetail, type DraftDetails } from './invoice-detail-context'
import { submitDraftUpdate } from './submit-draft-update'
import { formatVisitDate, SetPriceLink, VisitLineSummary } from './visit-line-summary'

type InvoiceVisitsCardProps = {
  invoiceId: string
  status: InvoiceStatus
  clientName: string
  lines: InvoiceDetailLine[]
  totalCents: number
  // An open draft: lines can be removed and added, Unpriced lines link to Set price.
  isEditable: boolean
  isAutomatic: boolean
  unpricedCount: number
  paidDate: string | null
  savedDetails: DraftDetails
  claimable: ClaimableVisit[]
  businessDate: string
}

const INVOICES_PATH = '/solutions/invoices'
const REMOVE_ERROR_TITLE = "Couldn't remove that visit"

// A draft shows every pill that applies (Unpriced and Upcoming together); an issued line shows its state.
function lineStates(line: InvoiceDetailLine, status: InvoiceStatus): LineState[] {
  if (line.state === 'cancelled') return ['cancelled']
  if (status === 'draft') return claimableStates(line.visit)
  return line.state === 'ok' ? [] : [line.state]
}

type LineRowProps = {
  line: InvoiceDetailLine
  status: InvoiceStatus
  isEditable: boolean
  isPending: boolean
  isBusy: boolean
  onRemove: (line: InvoiceDetailLine, trigger: HTMLButtonElement) => void
}

function LineRow({ line, status, isEditable, isPending, isBusy, onRemove }: LineRowProps) {
  const { visit } = line
  const isCancelled = line.state === 'cancelled'
  const isUnpriced = line.state === 'unpriced'

  return (
    <li
      aria-busy={isPending || undefined}
      className={cn('flex items-start gap-3 py-3 transition-opacity duration-fast', isPending && 'opacity-50')}
    >
      <div className="min-w-0 flex-1">
        <VisitLineSummary
          date={visit.scheduled_date}
          startTime={visit.scheduled_start_time}
          endTime={visit.scheduled_end_time}
          jobName={visit.job_name}
          locationLabel={visit.location_label}
          states={lineStates(line, status)}
          amountCents={line.amount_cents}
          appointmentId={visit.id}
          struck={isCancelled}
          billedAmountCents={line.billed_amount_cents}
          setPriceLink="none"
        />
        {isUnpriced && isEditable ? (
          <SetPriceLink appointmentId={visit.id} jobName={visit.job_name} date={visit.scheduled_date} />
        ) : null}
      </div>
      {isEditable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove visit on ${formatVisitDate(visit.scheduled_date)}`}
          disabled={isBusy}
          className="-mr-2 shrink-0 cursor-pointer transition-colors duration-fast active:bg-muted md:hover:bg-muted md:hover:text-destructive"
          onClick={(event) => onRemove(line, event.currentTarget)}
        >
          {isPending ? <Spinner aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
        </Button>
      ) : null}
    </li>
  )
}

function TotalRow({ status, totalCents, paidDate }: { status: InvoiceStatus; totalCents: number; paidDate: string | null }) {
  const isDraft = status === 'draft'
  const isVoid = status === 'void'
  let caption: string | null = null
  if (isDraft) {
    caption = 'Prices follow each visit until you issue.'
  } else if (isVoid) {
    caption = 'Void · not owed'
  } else if (status === 'paid' && paidDate) {
    caption = `Paid ${formatDateOnly(paidDate)}`
  }

  return (
    <div className="flex items-start justify-between gap-3 border-t pt-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{isDraft ? 'Total at Live price' : 'Total'}</p>
        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      </div>
      <p
        className={cn(
          'shrink-0 text-base font-semibold tabular-nums',
          isVoid && 'font-normal text-muted-foreground line-through'
        )}
      >
        {formatCents(totalCents)}
      </p>
    </div>
  )
}

export default function InvoiceVisitsCard({
  invoiceId,
  status,
  clientName,
  lines,
  totalCents,
  isEditable,
  isAutomatic,
  unpricedCount,
  paidDate,
  savedDetails,
  claimable,
  businessDate,
}: InvoiceVisitsCardProps) {
  const router = useRouter()
  const { runPageAction } = useInvoiceDetail()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastLine, setLastLine] = useState<InvoiceDetailLine | null>(null)
  // The remove button that opened the Delete draft confirm, for focus to return to on Keep.
  const lastLineTriggerRef = useRef<HTMLButtonElement | null>(null)

  function leaveIfDeleted(isDeleted: boolean) {
    if (isDeleted) {
      router.replace(INVOICES_PATH)
    }
  }

  async function removeLine(line: InvoiceDetailLine) {
    setError(null)
    setPendingId(line.visit.id)

    try {
      const result = await submitDraftUpdate({ invoiceId, removeIds: [line.visit.id], details: savedDetails })
      if (result.success) {
        toast.success(result.data.isDeleted ? 'Draft deleted' : 'Visit removed')
        leaveIfDeleted(result.data.isDeleted)
      } else {
        setError(result.error)
        router.refresh()
      }
    } catch (thrown) {
      console.error('Remove line failed:', thrown)
      setError(CONNECTION_ERROR_MESSAGE)
    }
    setPendingId(null)
  }

  function handleRemove(line: InvoiceDetailLine, trigger: HTMLButtonElement) {
    // Removing the only line that isn't Cancelled empties the draft, so that one asks first.
    const liveLines = lines.filter((other) => other.state !== 'cancelled')
    if (liveLines.length === 1 && liveLines[0] === line) {
      lastLineTriggerRef.current = trigger
      setLastLine(line)
    } else {
      void removeLine(line)
    }
  }

  async function handleConfirmLastLine() {
    if (!lastLine) return

    const removed = await runPageAction(
      {
        errorTitle: REMOVE_ERROR_TITLE,
        success: (data: { isDeleted: boolean }) => (data.isDeleted ? 'Draft deleted' : 'Visit removed'),
      },
      () => submitDraftUpdate({ invoiceId, removeIds: [lastLine.visit.id], details: savedDetails })
    )
    setLastLine(null)
    leaveIfDeleted(removed?.isDeleted ?? false)
  }

  return (
    <Card className="gap-4 p-4 text-sm sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Visits</h2>
        <p className="text-sm text-muted-foreground tabular-nums">{lines.length}</p>
      </div>

      {isEditable && isAutomatic ? (
        <p className="text-xs text-muted-foreground">
          Visits you remove won&apos;t rejoin an Automatic draft. You can add them back here or bill them on a manual
          invoice.
        </p>
      ) : null}

      {isEditable && unpricedCount > 0 ? (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Set a price on {unpricedCount} Unpriced visit{unpricedCount === 1 ? '' : 's'} to issue.
        </p>
      ) : null}

      <ul className="-my-3 divide-y divide-border">
        {lines.map((line) => (
          <LineRow
            key={line.visit.id}
            line={line}
            status={status}
            isEditable={isEditable}
            isPending={pendingId === line.visit.id}
            isBusy={pendingId !== null}
            onRemove={handleRemove}
          />
        ))}
      </ul>

      {isEditable ? (
        <AddVisitsPicker
          invoiceId={invoiceId}
          clientName={clientName}
          visits={claimable}
          businessDate={businessDate}
          savedDetails={savedDetails}
        />
      ) : null}

      {error ? (
        <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{REMOVE_ERROR_TITLE}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <TotalRow status={status} totalCents={totalCents} paidDate={paidDate} />

      <ConfirmDialog
        open={lastLine !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setLastLine(null)
        }}
        title="Delete this draft?"
        description={`This is its only visit. Removing it deletes the draft.${isAutomatic ? " The visit won't rejoin an Automatic draft." : ''}`}
        confirmLabel="Delete draft"
        pendingLabel="Deleting…"
        keepLabel="Keep draft"
        onConfirm={handleConfirmLastLine}
        returnFocusRef={lastLineTriggerRef}
      />
    </Card>
  )
}
