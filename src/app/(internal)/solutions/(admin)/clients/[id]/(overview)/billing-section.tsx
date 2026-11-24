import Link from 'next/link'
import { AlertCircle, AlertTriangle, ArrowRight } from 'lucide-react'

import { OUTLINE_PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import TabToolbar from '@/components/admin/detail-page/tab-toolbar'
import ClientBilling from '@/components/invoices/client-billing'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import StatTile from '@/components/ui/stat-tile'
import StatusBadge from '@/components/ui/status-badge'
import { groupClientInvoices } from '@/lib/invoices/client-invoices'
import { parsePick } from '@/lib/invoices/appointment-picker'
import { clientBillingHref, RECEIVABLES_PATH } from '@/lib/invoices/paths'
import type { ClientBilling as ClientBillingData } from '@/lib/invoices/queries'
import type { PaymentMethod } from '@/lib/invoices/ledger'
import { formatCents } from '@/lib/pricing/money'

type BillingSectionProps = {
  client: { id: string; name: string }
  // Null when the billing queries failed: the tab shows only the error.
  billing: (ClientBillingData & { methods: PaymentMethod[] }) | null
  businessDate: string
  // The raw ?pick= value: appointment ids to arrive ticked.
  pick: string | undefined
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function BillingError({ clientId }: { clientId: string }) {
  return (
    <Alert variant="destructive" className="has-data-[slot=alert-action]:pr-28 max-sm:has-data-[slot=alert-action]:pr-3">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Couldn&apos;t load billing</AlertTitle>
      <AlertDescription>Client info is fine; the invoices for this client didn&apos;t load.</AlertDescription>
      <AlertAction className="max-sm:static max-sm:col-start-2 max-sm:mt-2">
        <Button
          variant="outline"
          className="text-foreground"
          render={<Link href={clientBillingHref(clientId)} />}
          nativeButton={false}
        >
          Try again
        </Button>
      </AlertAction>
    </Alert>
  )
}

// Tiles come from invoice_receivables_totals scoped to this client, so they're right at any volume.
function BalanceTiles({ totals, overdueCount }: { totals: ClientBillingData['totals']; overdueCount: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile
        label="Owed"
        value={formatCents(totals.outstandingCents)}
        caption={totals.unpaidCount > 0 ? pluralize(totals.unpaidCount, 'issued invoice') : 'Nothing owed'}
        fitValue
        wrapHeader
      />
      <StatTile
        label="Overdue"
        value={formatCents(totals.overdueCents)}
        caption={overdueCount > 0 ? `${overdueCount} past due` : 'Nothing past due'}
        icon={
          overdueCount > 0 ? (
            <StatusBadge tone="warning" icon={AlertTriangle}>
              Past due
            </StatusBadge>
          ) : undefined
        }
        fitValue
        wrapHeader
      />
    </div>
  )
}

export function BillingSection({ client, billing, businessDate, pick }: BillingSectionProps) {
  const { owed } = billing ? groupClientInvoices(billing.invoices, businessDate, false) : { owed: [] }
  const initialPicked = billing
    ? parsePick(pick, [...billing.unbilled, ...billing.upcoming].map((appointment) => appointment.id))
    : []

  return (
    // The Billing tab labels this panel, so it has no heading of its own.
    <div className="space-y-6">
      <TabToolbar
        description="Invoices and balances for this client."
        action={
          <Button
            variant="outline"
            className={OUTLINE_PRESS_CLASS_NAME}
            render={<Link href={RECEIVABLES_PATH} />}
            nativeButton={false}
          >
            Receivables
            <ArrowRight aria-hidden="true" data-icon="inline-end" />
          </Button>
        }
      />

      {billing === null ? (
        <BillingError clientId={client.id} />
      ) : (
        <>
          <BalanceTiles
            totals={billing.totals}
            overdueCount={owed.filter((invoice) => invoice.effective_status === 'overdue').length}
          />
          <ClientBilling
            // A new ?pick= on the same page re-seeds the ticks.
            key={initialPicked.join(',')}
            clientId={client.id}
            clientName={client.name}
            invoices={billing.invoices}
            unbilled={billing.unbilled}
            upcoming={billing.upcoming}
            methods={billing.methods}
            businessDate={businessDate}
            initialPicked={initialPicked}
          />
        </>
      )}
    </div>
  )
}
