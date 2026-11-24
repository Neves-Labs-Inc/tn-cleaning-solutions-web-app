import { CalendarOff, FileText, TriangleAlert, Wallet } from 'lucide-react'

import PageHeader from '@/components/ui/page-header'
import StatTile from '@/components/ui/stat-tile'
import { countUnbilledVisits, getReceivables } from '@/lib/invoices/queries'
import { clientBalances, draftRows, groupUnbilled, overdueInvoices } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import { getBusinessDate } from '@/lib/schedule/business-time'
import { createClient } from '@/lib/supabase/server'
import { ByClientSection, DraftsSection, OverdueSection, UnbilledSection } from './sections'

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

export default async function ReceivablesPage() {
  const db = await createClient()
  const [receivables, unbilledCount] = await Promise.all([getReceivables(db), countUnbilledVisits(db)])
  const businessDate = getBusinessDate(new Date())

  const { totals } = receivables
  const overdue = overdueInvoices(receivables.owed)
  // Every client, archived and inactive too, so the balances add up to the Outstanding tile.
  const balances = clientBalances(
    receivables.owed,
    receivables.clients.map(({ id, name }) => ({ id, name })),
  )
  const groups = groupUnbilled(receivables.unbilled)
  const { draftCount } = totals
  const drafts = draftRows(receivables.drafts, businessDate)

  return (
    <div className="animate-in space-y-6 duration-slow fade-in-0 lg:space-y-8">
      <PageHeader title="Receivables" description="Who owes what, and what hasn't been billed yet." />

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
          href="#drafts"
          fitValue
        />
      </div>

      <DraftsSection drafts={drafts} />
      <ByClientSection balances={balances} />
      <OverdueSection invoices={overdue} businessDate={businessDate} />
      <UnbilledSection groups={groups} shownCount={receivables.unbilled.length} totalCount={unbilledCount} />
    </div>
  )
}
