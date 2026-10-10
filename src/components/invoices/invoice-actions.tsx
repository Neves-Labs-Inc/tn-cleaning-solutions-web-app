'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Ban,
  Banknote,
  CircleAlert,
  Ellipsis,
  Pencil,
  Send,
  Undo2,
  type LucideIcon,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ui/confirm-dialog'
import ResponsiveDialog from '@/components/ui/responsive-dialog'
import SubmitButton from '@/components/ui/submit-button'
import {
  archiveInvoice,
  undoPayment,
  unarchiveInvoice,
  voidInvoice,
  type InvoiceActionResult,
} from '@/lib/actions/invoices'
import type { ActionLayout, DetailAction } from '@/lib/invoices/detail-actions'
import type { PaymentMethod } from '@/lib/invoices/ledger'
import { formatDateOnly } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

import { useInvoiceDetail, type ActionError } from './invoice-detail-context'
import IssueForm from './issue-form'
import PaymentForm, { type PaymentValues } from './payment-form'

type InvoiceActionsProps = {
  invoiceId: string
  // The number once issued; "Draft" before.
  label: string
  layout: ActionLayout
  totalCents: number
  lineCount: number
  unpricedCount: number
  // The saved due date ('' when none).
  dueDate: string
  payment: PaymentValues | null
  methods: PaymentMethod[]
  businessDate: string
}

type Sheet = 'issue' | 'recordPayment' | 'editPayment' | 'void' | 'undoPayment' | 'more'
type ButtonVariant = 'default' | 'outline' | 'destructive'
type Placement = 'desktop' | 'bar' | 'more'

type ActionSpec = {
  label: string
  icon: LucideIcon
  variant: ButtonVariant
}

const ACTIONS: Record<DetailAction, ActionSpec> = {
  issue: { label: 'Issue', icon: Send, variant: 'default' },
  recordPayment: { label: 'Record payment', icon: Banknote, variant: 'default' },
  editPayment: { label: 'Edit payment', icon: Pencil, variant: 'outline' },
  undoPayment: { label: 'Undo payment', icon: Undo2, variant: 'outline' },
  void: { label: 'Void', icon: Ban, variant: 'destructive' },
  archive: { label: 'Archive', icon: Archive, variant: 'outline' },
  unarchive: { label: 'Unarchive', icon: ArchiveRestore, variant: 'default' },
}

// Archive and Unarchive run straight away; the rest open a sheet or a confirmation first.
const DIRECT_ACTIONS = {
  archive: {
    run: archiveInvoice,
    pendingLabel: 'Archiving…',
    errorTitle: "Couldn't archive this invoice",
    success: 'Invoice archived',
  },
  unarchive: {
    run: unarchiveInvoice,
    pendingLabel: 'Unarchiving…',
    errorTitle: "Couldn't unarchive this invoice",
    success: 'Invoice unarchived',
  },
} as const

type DirectAction = keyof typeof DIRECT_ACTIONS

const PRESS = 'cursor-pointer transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]'

function isDirect(action: DetailAction): action is DirectAction {
  return action in DIRECT_ACTIONS
}

// The More sheet lists Void and Undo payment as destructive even though Undo is outline in the header.
function variantFor(action: DetailAction, placement: Placement): ButtonVariant {
  const isDestructiveInMore = placement === 'more' && (action === 'void' || action === 'undoPayment')
  if (isDestructiveInMore) return 'destructive'
  return placement === 'more' && ACTIONS[action].variant === 'default' ? 'outline' : ACTIONS[action].variant
}

function invoiceFormData(invoiceId: string): FormData {
  const formData = new FormData()
  formData.set('invoice_id', invoiceId)
  return formData
}

function unpricedReason(count: number): string {
  return `Set a price on ${count} Unpriced visit${count === 1 ? '' : 's'} to issue.`
}

function BlockedReason({ id, count, className }: { id: string; count: number; className?: string }) {
  return (
    <p id={id} className={cn('flex items-start gap-1.5 text-sm text-muted-foreground', className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {unpricedReason(count)}
    </p>
  )
}

// Reports when its form stops submitting: that is when the page has re-rendered with the result,
// later than the action's own code finishes. A form the re-render removes (Archive, once archived)
// reports as it unmounts.
function FormSettledReporter({ onSettled }: { onSettled: () => void }) {
  const { pending } = useFormStatus()
  const wasPending = useRef(false)
  const onSettledRef = useRef(onSettled)

  useEffect(() => {
    onSettledRef.current = onSettled
  })

  useEffect(() => {
    if (wasPending.current && !pending) onSettledRef.current()
    wasPending.current = pending
  }, [pending])

  useEffect(
    () => () => {
      if (wasPending.current) onSettledRef.current()
    },
    []
  )

  return null
}

export function PageErrorAlert({ error, className }: { error: ActionError; className?: string }) {
  return (
    <Alert
      variant="destructive"
      className={cn('animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart', className)}
    >
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{error.title}</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  )
}

export default function InvoiceActions({
  invoiceId,
  label,
  layout,
  totalCents,
  lineCount,
  unpricedCount,
  dueDate,
  payment,
  methods,
  businessDate,
}: InvoiceActionsProps) {
  const { pageError, runPageAction } = useInvoiceDetail()
  const desktopReasonId = useId()
  const barReasonId = useId()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // A More item opens its sheet as the More sheet closes, so the More sheet mustn't pull focus back.
  const [isHandingOff, setIsHandingOff] = useState(false)
  // A sheet's form is submitting: it stays open until the result is in.
  const [isSheetPending, setIsSheetPending] = useState(false)
  // Archive or Unarchive is running: every other action waits.
  const [busyAction, setBusyAction] = useState<DirectAction | null>(null)
  // Where focus returns when a sheet closes; a More item is gone by then, so it's the More button.
  const openerRef = useRef<HTMLElement | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)

  const isIssueBlocked = unpricedCount > 0
  const isPastDue = dueDate !== '' && dueDate < businessDate

  function clearBusy() {
    setBusyAction(null)
  }

  function handleSheetChange(next: Sheet) {
    return (isOpen: boolean) => setSheet(isOpen ? next : null)
  }

  function openMore(event: React.MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget
    setIsHandingOff(false)
    setSheet('more')
  }

  async function runDirect(action: DirectAction) {
    const { run, errorTitle, success } = DIRECT_ACTIONS[action]
    await runPageAction({ errorTitle, success }, () => run(null, invoiceFormData(invoiceId)))
    setSheet(null)
  }

  async function runConfirmed(copy: { errorTitle: string; success: string }, run: typeof voidInvoice) {
    await runPageAction<null>(copy, (): Promise<InvoiceActionResult> => run(null, invoiceFormData(invoiceId)))
    // Closes on failure too: the error shows in the page's slot.
    setSheet(null)
  }

  function renderButton(action: DetailAction, placement: Placement) {
    const spec = ACTIONS[action]
    const Icon = spec.icon
    const isPrimaryInBar = placement === 'bar'
    const size = isPrimaryInBar || placement === 'more' ? 'lg' : 'default'
    const className = cn(PRESS, isPrimaryInBar && 'flex-1', placement === 'more' && 'w-full')
    const variant = variantFor(action, placement)
    const icon = <Icon aria-hidden="true" />

    if (isDirect(action)) {
      return (
        <form
          key={action}
          action={() => runDirect(action)}
          // Set in the submit event: a state update inside the action would only land when it ends.
          onSubmit={() => setBusyAction(action)}
          className={cn(isPrimaryInBar && 'flex flex-1', placement === 'more' && 'w-full')}>
          <SubmitButton
            variant={variant}
            size={size}
            className={cn(className, 'w-full')}
            icon={icon}
            label={spec.label}
            pendingLabel={DIRECT_ACTIONS[action].pendingLabel}
            disabled={busyAction !== null && busyAction !== action}
          />
          <FormSettledReporter onSettled={clearBusy} />
        </form>
      )
    }

    const isBlocked = action === 'issue' && isIssueBlocked
    const reasonId = placement === 'desktop' ? desktopReasonId : barReasonId

    function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
      const isFromMore = placement === 'more'
      openerRef.current = isFromMore ? moreButtonRef.current : event.currentTarget
      setIsHandingOff(isFromMore)
      setSheet(action as Sheet)
    }

    return (
      <Button
        key={action}
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={isBlocked || busyAction !== null}
        aria-describedby={isBlocked ? reasonId : undefined}
        onClick={handleClick}
      >
        {icon}
        {spec.label}
      </Button>
    )
  }

  const paymentDescription = `${label} · ${formatCents(totalCents)}. Paid in full; partial payments aren't tracked.`

  return (
    <>
      <div className="hidden flex-col items-end gap-2 md:flex">
        <div className="flex flex-wrap justify-end gap-2">
          {layout.desktop.map((action) => renderButton(action, 'desktop'))}
        </div>
        {isIssueBlocked && layout.primary === 'issue' ? (
          <BlockedReason id={desktopReasonId} count={unpricedCount} className="max-w-md text-right" />
        ) : null}
        {pageError ? <PageErrorAlert error={pageError} className="lg:max-w-md" /> : null}
      </div>

      {layout.primary ? (
        <div className="fixed inset-x-0 bottom-0 z-30 space-y-2 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur md:hidden">
          {isIssueBlocked && layout.primary === 'issue' ? <BlockedReason id={barReasonId} count={unpricedCount} /> : null}
          {pageError ? <PageErrorAlert error={pageError} /> : null}
          <div className="flex gap-2">
            {layout.more.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="More actions"
                ref={moreButtonRef}
                className={PRESS}
                disabled={busyAction !== null}
                onClick={openMore}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            ) : null}
            {renderButton(layout.primary, 'bar')}
          </div>
        </div>
      ) : null}

      <ResponsiveDialog
        open={sheet === 'more'}
        onOpenChange={handleSheetChange('more')}
        title="More actions"
        isPending={busyAction !== null}
        shouldRestoreFocus={!isHandingOff}
        returnFocusRef={moreButtonRef}
      >
        <div className="flex flex-col gap-2">{layout.more.map((action) => renderButton(action, 'more'))}</div>
      </ResponsiveDialog>

      {layout.primary === 'issue' ? (
        <ResponsiveDialog
          open={sheet === 'issue'}
          onOpenChange={handleSheetChange('issue')}
          title="Issue this draft"
          description="It gets the next invoice number and its prices are frozen. You can't edit it after this."
          isPending={isSheetPending}
          returnFocusRef={openerRef}
        >
          <IssueForm
            invoiceId={invoiceId}
            savedDueDate={dueDate}
            lineCount={lineCount}
            totalCents={totalCents}
            businessDate={businessDate}
            onCancel={() => setSheet(null)}
            onSuccess={() => setSheet(null)}
            onPendingChange={setIsSheetPending}
          />
        </ResponsiveDialog>
      ) : null}

      {layout.primary === 'recordPayment' || layout.primary === 'editPayment' ? (
        <ResponsiveDialog
          open={sheet === layout.primary}
          onOpenChange={handleSheetChange(layout.primary)}
          title={layout.primary === 'recordPayment' ? 'Record payment' : 'Edit payment'}
          description={paymentDescription}
          isPending={isSheetPending}
          returnFocusRef={openerRef}
        >
          <PaymentForm
            mode={layout.primary === 'recordPayment' ? 'record' : 'edit'}
            invoiceId={invoiceId}
            methods={methods}
            initial={layout.primary === 'editPayment' ? payment : null}
            businessDate={businessDate}
            onCancel={() => setSheet(null)}
            onSuccess={() => setSheet(null)}
            onPendingChange={setIsSheetPending}
          />
        </ResponsiveDialog>
      ) : null}

      {layout.desktop.includes('void') ? (
        <ConfirmDialog
          open={sheet === 'void'}
          onOpenChange={handleSheetChange('void')}
          title={`Void ${label}?`}
          description={
            payment
              ? "Its payment is cleared and its visits can be billed again. The number is kept and never reused. This can't be undone."
              : "Its visits can be billed again. The number is kept and never reused. This can't be undone."
          }
          confirmLabel="Void invoice"
          pendingLabel="Voiding…"
          keepLabel="Keep invoice"
          returnFocusRef={openerRef}
          onConfirm={() =>
            runConfirmed({ errorTitle: "Couldn't void this invoice", success: `${label} voided` }, voidInvoice)
          }
        />
      ) : null}

      {layout.desktop.includes('undoPayment') ? (
        <ConfirmDialog
          open={sheet === 'undoPayment'}
          onOpenChange={handleSheetChange('undoPayment')}
          title="Undo this payment?"
          description={`${label} goes back to issued.${isPastDue ? ` It shows as overdue again (due ${formatDateOnly(dueDate)}).` : ''}`}
          confirmLabel="Undo payment"
          pendingLabel="Undoing…"
          keepLabel="Keep payment"
          returnFocusRef={openerRef}
          onConfirm={() =>
            runConfirmed({ errorTitle: "Couldn't undo the payment", success: 'Payment undone' }, undoPayment)
          }
        />
      ) : null}
    </>
  )
}
