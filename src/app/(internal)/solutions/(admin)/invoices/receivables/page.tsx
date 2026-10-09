import Link from 'next/link'
import { ArrowLeft, CalendarOff, FileText, TriangleAlert, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import StatTile from '@/components/ui/stat-tile'
import { countUnbilledVisits, getReceivables } from '@/lib/invoices/queries'
import { clientBalances, groupUnbilled, overdueInvoices, receivablesTotals } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import { getBusinessDate } from '@/lib/schedule/business-time'
import { createClient } from '@/lib/supabase/server'
import { ByClientSection, OverdueSection, UnbilledSection } from './sections'

const INVOICES_PATH = '/solutions/invoices'

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export default async function ReceivablesPage() {
  const db = await createClient()
  const [receivables, unbilledCount] = await Promise.all([getReceivables(db), countUnbilledVisits(db)])
  const businessDate = getBusinessDate(new Date())

  const totals = receivablesTotals(receivables.invoices)
  const overdue = overdueInvoices(receivables.invoices)
  // Every client, archived and inactive too, so the balances add up to the Outstanding tile.
  const balances = clientBalances(
    receivables.invoices,
    receivables.clients.map(({ id, name }) => ({ id, name })),
  )
  const groups = groupUnbilled(receivables.unbilled)
  const draftCount = receivables.invoices.filter((row) => row.status === 'draft' && !row.is_archived).length

  return (
    <div className="animate-in space-y-6 duration-slow fade-in-0 lg:space-y-8">
      <div className="space-y-2">
        <Button
          variant="ghost"
          className="-ml-3 transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] active:bg-muted"
          nativeButton={false}
          render={<Link href={INVOICES_PATH} />}
        >
          <ArrowLeft aria-hidden="true" />
          Invoices
        </Button>
        <PageHeader title="Receivables" description="Who owes what, and what hasn't been billed yet." />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Outstanding"
          value={formatCents(totals.outstandingCents)}
          caption={totals.unpaidCount > 0 ? pluralize(totals.unpaidCount, 'unpaid invoice') : 'Nothing owed'}
          icon={<Wallet className="size-5" aria-hidden="true" />}
          href="#by-client"
          fitValue
        />
        <StatTile
          label="Overdue"
          value={formatCents(totals.overdueCents)}
          caption={overdue.length > 0 ? `${overdue.length} past due` : 'Nothing past due'}
          icon={<TriangleAlert className="size-5" aria-hidden="true" />}
          href="#overdue"
          fitValue
        />
        <StatTile
          label="No due date"
          value={formatCents(totals.noDueDateCents)}
          caption="Owed, never overdue"
          icon={<CalendarOff className="size-5" aria-hidden="true" />}
          href="#by-client"
          fitValue
        />
        <StatTile
          label="Drafted"
          value={formatCents(receivables.drafted_cents)}
          caption={draftCount > 0 ? `${pluralize(draftCount, 'draft')}, not owed yet` : 'No open drafts'}
          icon={<FileText className="size-5" aria-hidden="true" />}
          href={`${INVOICES_PATH}?status=draft`}
          fitValue
        />
      </div>

      <ByClientSection balances={balances} />
      <OverdueSection invoices={overdue} businessDate={businessDate} />
      <UnbilledSection groups={groups} shownCount={receivables.unbilled.length} totalCount={unbilledCount} />
    </div>
  )
}
