'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleCheck, Pencil, ReceiptText } from 'lucide-react'
import { toast } from 'sonner'

import { OUTLINE_PRESS_CLASS_NAME, PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { useAppointmentsCache } from '@/hooks/use-appointments-cache'
import { createInvoice } from '@/lib/actions/invoices'
import { groupClientInvoices, type ClientInvoice, type ClientInvoiceRow } from '@/lib/invoices/client-invoices'
import type { PaymentMethod } from '@/lib/invoices/ledger'
import type { MarkPaidAppointment } from '@/lib/invoices/mark-paid'
import { invoiceHref } from '@/lib/invoices/paths'
import {
  isUpcomingOpenInitially,
  selectionSummary,
  type PickerAppointment,
} from '@/lib/invoices/appointment-picker'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

import AddOrNewDialog, { NEW_DRAFT } from './add-or-new-dialog'
import { AppointmentPicker } from './appointment-picker'
import InvoiceRow from './invoice-row'
import MarkPaidDialog from './mark-paid-dialog'
import { useSubmitDraftUpdate } from './submit-draft-update'

// overflow-hidden would break the Unbilled card's sticky bar, so that card clips instead.
const CARD_CLASS_NAME = 'overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-foreground/10'
const UNBILLED_CARD_CLASS_NAME = 'overflow-clip rounded-lg bg-card shadow-sm ring-1 ring-foreground/10'
const ACTION_BUTTON_CLASS_NAME = 'min-h-11 flex-1 sm:flex-none'
const CREATE_FAILED_MESSAGE = "Couldn't create the draft. Try again."

type ClientBillingProps = {
  clientId: string
  clientName: string
  invoices: ClientInvoice[]
  unbilled: PickerAppointment[]
  upcoming: PickerAppointment[]
  methods: PaymentMethod[]
  businessDate: string
  // ?pick= ids already matched against the picker's rows.
  initialPicked: string[]
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function SectionHeader({ title, count, aside }: { title: string; count: string; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <h3 className="text-lg font-semibold tracking-tight">
        {title} <span className="text-sm font-normal text-muted-foreground tabular-nums">· {count}</span>
      </h3>
      {aside}
    </div>
  )
}

type InvoiceCardProps = {
  invoices: ClientInvoiceRow[]
  clientId: string
  // Rows that only show because Show archived is on.
  isRevealed?: (invoice: ClientInvoiceRow) => boolean
  empty: { icon: React.ReactNode; title: string; description: string }
}

function InvoiceCard({ invoices, clientId, isRevealed, empty }: InvoiceCardProps) {
  return (
    <div className={CARD_CLASS_NAME}>
      {invoices.length > 0 ? (
        <ul className="divide-y divide-border">
          {invoices.map((invoice, index) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              clientId={clientId}
              index={index}
              isRevealed={isRevealed?.(invoice)}
            />
          ))}
        </ul>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{empty.icon}</EmptyMedia>
            <EmptyTitle>{empty.title}</EmptyTitle>
            <EmptyDescription>{empty.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

type BillActionsProps = {
  isDisabled: boolean
  isCreating: boolean
  onInvoice: () => void
  onMarkPaid: () => void
  className?: string
}

// Mark paid (outline) on the left, Invoice (primary) on the right.
function BillActions({ isDisabled, isCreating, onInvoice, onMarkPaid, className }: BillActionsProps) {
  return (
    <div className={className}>
      <Button
        type="button"
        variant="outline"
        disabled={isDisabled || isCreating}
        onClick={onMarkPaid}
        className={cn(OUTLINE_PRESS_CLASS_NAME, ACTION_BUTTON_CLASS_NAME)}
      >
        Mark paid
      </Button>
      <Button
        type="button"
        disabled={isDisabled || isCreating}
        aria-busy={isCreating}
        onClick={onInvoice}
        className={cn(PRESS_CLASS_NAME, ACTION_BUTTON_CLASS_NAME, 'sm:min-w-36')}
      >
        {isCreating ? (
          <>
            <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
            Creating draft…
          </>
        ) : (
          'Invoice'
        )}
      </Button>
    </div>
  )
}

function toMarkPaidAppointment(appointment: PickerAppointment, isUpcoming: boolean): MarkPaidAppointment {
  return {
    id: appointment.id,
    scheduledDate: appointment.scheduled_date,
    jobName: appointment.job_name,
    // The dialog only needs to tell completed work from billed-ahead work.
    status: isUpcoming ? 'scheduled' : 'completed',
    livePriceCents: appointment.price_cents,
    claim: null,
    claimTotalCents: null,
  }
}

// The stateful part of the Billing tab: drafts, owed, the unbilled picker with Invoice and Mark
// paid, and History. The tiles above it are server-rendered.
export default function ClientBilling({
  clientId,
  clientName,
  invoices,
  unbilled,
  upcoming,
  methods,
  businessDate,
  initialPicked,
}: ClientBillingProps) {
  const router = useRouter()
  const { applyChanges } = useAppointmentsCache()
  const submitDraftUpdate = useSubmitDraftUpdate()
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialPicked))
  const [isArchivedShown, setIsArchivedShown] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isChoosing, setIsChoosing] = useState(false)
  const [markPaidAppointments, setMarkPaidAppointments] = useState<MarkPaidAppointment[]>([])

  const { drafts, owed, history } = groupClientInvoices(invoices, businessDate, isArchivedShown)
  const listed = [...unbilled, ...upcoming]
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id))
  // Ids that left the list since the page loaded (billed elsewhere) can't stay ticked.
  const pickedIds = listed.filter((appointment) => selected.has(appointment.id)).map((appointment) => appointment.id)
  const summary = selectionSummary(new Set(pickedIds), listed)
  const unbilledTotalCents = unbilled.reduce((total, appointment) => total + (appointment.price_cents ?? 0), 0)
  const unpricedCount = unbilled.filter((appointment) => appointment.price_cents === null).length
  const isNothingToBill = listed.length === 0
  const hasSelection = pickedIds.length > 0
  const summaryText = `${pluralize(summary.count, 'appointment')} · ${formatCents(summary.totalCents)}`

  function clearSelection() {
    setSelected(new Set())
  }

  async function createDraftFromSelection(): Promise<{ id: string } | { error: string }> {
    const formData = new FormData()
    formData.set('client_id', clientId)
    for (const id of pickedIds) {
      formData.append('appointment_ids', id)
    }
    const result = await createInvoice(null, formData)
    if (!result.success) return { error: result.error }

    void applyChanges(result.appointmentIds)
    return { id: result.data.id }
  }

  async function handleInvoice() {
    if (drafts.length > 0) {
      setIsChoosing(true)
      return
    }

    setIsCreating(true)
    try {
      const created = await createDraftFromSelection()
      if ('error' in created) {
        toast.error(created.error)
        return
      }
      toast.success('Draft created')
      clearSelection()
      router.push(invoiceHref(clientId, created.id))
    } catch (thrown) {
      console.error('Create draft failed:', thrown)
      toast.error(CREATE_FAILED_MESSAGE)
    } finally {
      setIsCreating(false)
    }
  }

  // Resolves to the message to show in the dialog, or null once the draft is made or added to.
  async function handleConfirmChoice(target: string): Promise<string | null> {
    let draftId = target
    if (target === NEW_DRAFT) {
      const created = await createDraftFromSelection()
      if ('error' in created) return created.error
      draftId = created.id
    } else {
      const result = await submitDraftUpdate({ invoiceId: target, addIds: pickedIds })
      if (!result.success) {
        // A refusal can mean the page is stale (a draft issued or archived elsewhere).
        router.refresh()
        return result.error
      }
    }

    toast.success(target === NEW_DRAFT ? 'Draft created' : 'Added to draft')
    clearSelection()
    setIsChoosing(false)
    router.push(invoiceHref(clientId, draftId))
    return null
  }

  function handleMarkPaid() {
    setMarkPaidAppointments(
      listed
        .filter((appointment) => selected.has(appointment.id))
        .map((appointment) => toMarkPaidAppointment(appointment, upcomingIds.has(appointment.id)))
    )
  }

  const actionProps = {
    isDisabled: !hasSelection,
    isCreating,
    onInvoice: () => void handleInvoice(),
    onMarkPaid: handleMarkPaid,
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader title="Drafts" count={String(drafts.length)} />
        <InvoiceCard
          invoices={drafts}
          clientId={clientId}
          empty={{
            icon: <Pencil aria-hidden="true" />,
            title: 'No open drafts',
            description: 'Tick appointments below, then choose Invoice to start one.',
          }}
        />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Owed" count={String(owed.length)} />
        <InvoiceCard
          invoices={owed}
          clientId={clientId}
          empty={{
            icon: <ReceiptText aria-hidden="true" />,
            title: 'Nothing owed',
            description: 'Issued invoices for this client will show here.',
          }}
        />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Unbilled appointments"
          count={`${unbilled.length} · ${formatCents(unbilledTotalCents)}${unpricedCount > 0 ? ` · ${unpricedCount} unpriced` : ''}`}
          aside={<BillActions {...actionProps} className="hidden gap-2 sm:flex" />}
        />
        <div className={UNBILLED_CARD_CLASS_NAME}>
          {isNothingToBill ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleCheck aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No unbilled appointments</EmptyTitle>
                <EmptyDescription>Every completed appointment is on an invoice.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <AppointmentPicker
              unbilled={unbilled}
              upcoming={upcoming}
              selected={selected}
              onSelectedChange={setSelected}
              isUpcomingOpenByDefault={isUpcomingOpenInitially(initialPicked, upcoming)}
              disabled={isCreating}
              className="rounded-none bg-transparent shadow-none ring-0"
            />
          )}
          <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t bg-card/95 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
            <p className="text-sm tabular-nums" aria-live="polite">
              {isNothingToBill ? (
                <span className="text-muted-foreground">No appointments to bill</span>
              ) : hasSelection ? (
                <>
                  <span className="font-semibold">{pluralize(summary.count, 'appointment')}</span>{' '}
                  <span className="text-muted-foreground">· {formatCents(summary.totalCents)}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Tick appointments to bill</span>
              )}
            </p>
            <BillActions {...actionProps} className="flex w-full gap-2 sm:hidden" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="History"
          count={String(history.length)}
          aside={
            <label className="flex min-h-11 cursor-pointer items-center gap-2 py-2 text-sm">
              <Switch checked={isArchivedShown} onCheckedChange={setIsArchivedShown} aria-label="Show archived" />
              Show archived
            </label>
          }
        />
        <InvoiceCard
          invoices={history}
          clientId={clientId}
          isRevealed={(invoice) => invoice.is_archived}
          empty={{
            icon: <ReceiptText aria-hidden="true" />,
            title: 'No paid or void invoices yet',
            description: 'Paid and void invoices show here.',
          }}
        />
      </section>

      <AddOrNewDialog
        open={isChoosing}
        onOpenChange={setIsChoosing}
        drafts={drafts}
        selectionSummary={summaryText}
        onConfirm={handleConfirmChoice}
      />

      <MarkPaidDialog
        appointments={markPaidAppointments}
        clientId={clientId}
        clientName={clientName}
        methods={methods}
        businessDate={businessDate}
        onSuccess={clearSelection}
        onClose={() => setMarkPaidAppointments([])}
      />
    </div>
  )
}
