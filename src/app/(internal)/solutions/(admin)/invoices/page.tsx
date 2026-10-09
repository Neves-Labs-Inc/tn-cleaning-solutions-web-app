import Link from 'next/link'
import { Plus } from 'lucide-react'

import InvoiceLedgerList from '@/components/invoices/invoice-ledger-list'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import {
  filterInvoices,
  invoiceClientOptions,
  parseInvoiceFilter,
  toLedgerListRow,
} from '@/lib/invoices/view'
import { listInvoices } from '@/lib/invoices/queries'
import { getBusinessDate } from '@/lib/schedule/business-time'
import { createClient } from '@/lib/supabase/server'

type InvoicesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const INVOICES_PATH = '/solutions/invoices'

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const parsed = parseInvoiceFilter(await searchParams)
  const db = await createClient()
  const invoices = await listInvoices(db)
  const clients = invoiceClientOptions(invoices)
  // An unknown client id would filter the list while the select showed "All clients".
  const filter = clients.some((client) => client.id === parsed.clientId) ? parsed : { ...parsed, clientId: '' }

  const rows = filterInvoices(invoices, filter).map(toLedgerListRow)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        action={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Button variant="outline" render={<Link href={`${INVOICES_PATH}/receivables`} />} nativeButton={false}>
              Receivables
            </Button>
            <Button variant="outline" render={<Link href={`${INVOICES_PATH}/payment-methods`} />} nativeButton={false}>
              Payment methods
            </Button>
            <Button
              className="order-first col-span-2 sm:order-none"
              render={<Link href={`${INVOICES_PATH}/new`} />}
              nativeButton={false}
            >
              <Plus aria-hidden="true" data-icon="inline-start" />
              New invoice
            </Button>
          </div>
        }
      />
      <InvoiceLedgerList
        rows={rows}
        loadedCount={invoices.length}
        clients={clients}
        filter={filter}
        businessDate={getBusinessDate(new Date())}
      />
    </div>
  )
}
