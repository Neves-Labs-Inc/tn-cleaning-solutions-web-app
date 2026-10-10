import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Archive, ArrowLeft, ChevronRight } from 'lucide-react'

import DraftDetailsForm from '@/components/invoices/draft-details-form'
import InvoiceActions from '@/components/invoices/invoice-actions'
import InvoiceBadges from '@/components/invoices/invoice-badges'
import { InvoiceDetailProvider } from '@/components/invoices/invoice-detail-context'
import InvoiceVisitsCard from '@/components/invoices/invoice-visits-card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { actionLayout } from '@/lib/invoices/detail-actions'
import { InvoiceLedger, type PaymentMethod } from '@/lib/invoices/ledger'
import { getInvoiceDetail, listClaimableVisits, type ClaimableVisit } from '@/lib/invoices/queries'
import { allowedActions } from '@/lib/invoices/transitions'
import { dueLabel, formatDateOnly, invoiceLabel } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import { formatBusinessDate, getBusinessDate } from '@/lib/schedule/business-time'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type InvoiceDetailPageProps = {
  params: Promise<{ id: string }>
}

const INVOICES_PATH = '/solutions/invoices'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CARD_CLASS = 'gap-4 p-4 text-sm sm:p-5'
const CARD_TITLE_CLASS = 'text-lg font-semibold tracking-tight'

type Fact = { label: string; value: string; isWide?: boolean }

// dt is a caption above its dd: two columns on phones, stacked in the side column on desktop.
function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-1">
      {facts.map((fact) => (
        <div key={fact.label} className={cn('min-w-0', fact.isWide && 'col-span-2 lg:col-span-1')}>
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="break-words whitespace-pre-wrap">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

async function loadPaymentMethods(ledger: InvoiceLedger): Promise<PaymentMethod[]> {
  const result = await ledger.listPaymentMethods()
  // The picker can't be offered without the list; error.tsx shows the failure.
  if (!result.ok) throw new Error(`Couldn't load payment methods: ${result.message}`)
  return result.data
}

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = await params
  if (!UUID.test(id)) notFound()

  const db = await createClient()
  const detail = await getInvoiceDetail(db, id)
  if (!detail) notFound()

  const { invoice, lines, total_cents: totalCents } = detail
  const businessDate = getBusinessDate(new Date())
  const allowed = allowedActions(invoice)
  const layout = actionLayout(allowed)
  const isEditable = allowed.has('edit')
  const needsMethods = allowed.has('recordPayment') || allowed.has('editPayment')

  const [claimable, methods] = await Promise.all([
    isEditable ? listClaimableVisits(db, invoice.client_id) : Promise.resolve<ClaimableVisit[]>([]),
    needsMethods ? loadPaymentMethods(new InvoiceLedger(db)) : Promise.resolve<PaymentMethod[]>([]),
  ])

  const label = invoiceLabel(invoice)
  const clientName = invoice.client?.name ?? 'Unknown client'
  const isDraft = invoice.status === 'draft'
  const isVoid = invoice.status === 'void'
  const isPaid = invoice.status === 'paid'
  const unpricedCount = lines.filter((line) => line.state === 'unpriced').length
  // Cancelled lines charge nothing and aren't issued as visits.
  const liveLineCount = lines.filter((line) => line.state !== 'cancelled').length
  const savedDetails = { dueDate: invoice.due_date ?? '', notes: invoice.notes ?? '' }
  const createdLabel = invoice.created_at ? formatBusinessDate(new Date(invoice.created_at)) : 'Unknown'
  const payment =
    isPaid && invoice.paid_date
      ? {
          paidDate: invoice.paid_date,
          method: invoice.payment_method ?? '',
          reference: invoice.payment_reference ?? '',
        }
      : null

  const facts: Fact[] = isDraft
    ? [
        { label: 'Due', value: dueLabel(invoice, businessDate) },
        { label: 'Created', value: createdLabel },
        { label: 'Notes', value: invoice.notes?.trim() || 'No notes.', isWide: true },
      ]
    : [
        { label: 'Issued', value: invoice.issued_date ? formatDateOnly(invoice.issued_date) : 'Not issued' },
        { label: 'Due', value: dueLabel(invoice, businessDate) },
        { label: 'Created', value: createdLabel },
      ]

  return (
    <InvoiceDetailProvider key={invoice.id} savedDetails={savedDetails}>
      <div className="space-y-6 pb-[calc(8rem+var(--safe-bottom))] md:pb-0">
        <div className="min-w-0 space-y-3">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 min-h-11 transition-[background-color,transform,box-shadow] md:min-h-0 duration-fast active:scale-[0.98] active:bg-muted"
            nativeButton={false}
            render={<Link href={INVOICES_PATH} />}
          >
            <ArrowLeft aria-hidden="true" />
            Invoices
          </Button>

          {/* Actions sit beside the title only from xl: at md and lg four of them would squeeze it. */}
          <PageHeader
            className="sm:flex-col xl:flex-row"
            title={
              // Keyed on the label so the number swaps in when a draft is issued. Only the title
              // animates: a transform on the header would trap the actions' fixed phone bar.
              <span key={label} className="inline-block whitespace-nowrap animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart">
                {label}
              </span>
            }
            action={
              <InvoiceActions
                invoiceId={invoice.id}
                label={label}
                layout={layout}
                totalCents={totalCents}
                lineCount={liveLineCount}
                unpricedCount={unpricedCount}
                dueDate={invoice.due_date ?? ''}
                payment={payment}
                methods={methods}
                businessDate={businessDate}
              />
            }
          />

          {invoice.client ? (
            <Link
              href={`/solutions/clients/${invoice.client.id}`}
              className="flex min-h-11 w-fit max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-sm text-sm font-medium text-muted-foreground outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 active:text-foreground/80 md:min-h-0 md:hover:underline"
            >
              <span className="block min-w-0 truncate">{clientName}</span>
              <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{clientName}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <InvoiceBadges
              row={{
                effective_status: invoice.effective_status,
                is_automatic: invoice.is_automatic,
                is_archived: invoice.is_archived,
                has_unpriced: detail.has_unpriced,
              }}
            />
            <span className="ml-auto flex shrink-0 items-baseline gap-2">
              {isVoid ? <span className="text-xs text-muted-foreground">Void · not owed</span> : null}
              <span
                className={cn(
                  'text-base font-semibold tabular-nums',
                  isVoid && 'font-normal text-muted-foreground line-through'
                )}
              >
                {formatCents(totalCents)}
              </span>
            </span>
          </div>
        </div>

        {invoice.is_archived ? (
          <Alert>
            <Archive aria-hidden="true" />
            <AlertTitle>Archived · read-only</AlertTitle>
            <AlertDescription>
              Unarchive it to make changes.
              {isDraft ? " Its visits were released; unarchiving claims them again if no other invoice has." : ''}
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Phones stack Visits, Details, Payment, Notes; from lg Visits and Notes sit left, Details and Payment right. */}
        <div className="flex animate-in flex-col gap-6 fade-in-0 duration-slow lg:grid lg:grid-cols-3 lg:items-start">
          <div className="contents lg:col-span-2 lg:block lg:min-w-0 lg:space-y-6">
            <div className="order-1 min-w-0 lg:order-none">
              <InvoiceVisitsCard
                invoiceId={invoice.id}
                status={invoice.status}
                clientName={clientName}
                lines={lines}
                totalCents={totalCents}
                isEditable={isEditable}
                isAutomatic={invoice.is_automatic}
                unpricedCount={unpricedCount}
                paidDate={invoice.paid_date}
                savedDetails={savedDetails}
                claimable={claimable}
                businessDate={businessDate}
              />
            </div>

            {isDraft ? null : (
              <Card className={cn(CARD_CLASS, 'order-4 min-w-0 lg:order-none')}>
                <h2 className={CARD_TITLE_CLASS}>Notes</h2>
                {invoice.notes?.trim() ? (
                  <p className="leading-6 break-words whitespace-pre-wrap">{invoice.notes}</p>
                ) : (
                  <p className="text-muted-foreground">No notes.</p>
                )}
              </Card>
            )}
          </div>

          <div className="contents lg:block lg:min-w-0 lg:space-y-6">
            <div className="order-2 min-w-0 lg:order-none">
              {isEditable ? (
                <DraftDetailsForm invoiceId={invoice.id} createdLabel={createdLabel} businessDate={businessDate} />
              ) : (
                <Card className={CARD_CLASS}>
                  <h2 className={CARD_TITLE_CLASS}>Details</h2>
                  <FactList facts={facts} />
                </Card>
              )}
            </div>

            {payment ? (
              <Card
                className={cn(
                  CARD_CLASS,
                  'order-3 min-w-0 animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart lg:order-none'
                )}
              >
                <h2 className={CARD_TITLE_CLASS}>Payment</h2>
                <FactList
                  facts={[
                    { label: 'Paid on', value: formatDateOnly(payment.paidDate) },
                    { label: 'Method', value: payment.method || 'Not recorded' },
                    { label: 'Reference', value: payment.reference || 'None', isWide: true },
                  ]}
                />
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </InvoiceDetailProvider>
  )
}
