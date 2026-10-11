import Link from 'next/link'
import { ArrowLeft, ReceiptText } from 'lucide-react'

import { CreateInvoiceForm } from '@/components/invoices/create-invoice-form'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import PageHeader from '@/components/ui/page-header'
import { listBillableClients, listClaimableVisits } from '@/lib/invoices/queries'
import { getBusinessDate } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'

type NewInvoicePageProps = {
  searchParams: Promise<{ client?: string | string[]; visits?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

// ?visits=<id,id> hands appointments over (from the appointment page): those that are the
// client's claimable ones start checked. Absent, the default selection applies.
function handedOffIds(value: string | string[] | undefined): string[] | null {
  return value === undefined ? null : firstParam(value).split(',').filter(Boolean)
}

export default async function NewInvoicePage({ searchParams }: NewInvoicePageProps) {
  const query = await searchParams
  const requestedId = firstParam(query.client)
  const db = await createClient()

  // Read failures throw to error.tsx.
  const clients = await listBillableClients(db)
  const clientId = clients.some((client) => client.id === requestedId) ? requestedId : ''
  const visits = clientId ? await listClaimableVisits(db, clientId) : []

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-3">
        <Button
          variant="ghost"
          className="-ml-3 transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] active:bg-muted"
          nativeButton={false}
          render={<Link href="/solutions/invoices" />}
        >
          <ArrowLeft aria-hidden="true" />
          Invoices
        </Button>
        <PageHeader
          title="New invoice"
          description="Pick a client, then the appointments to bill. Appointments up to today start checked."
        />
      </div>

      {clients.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptText aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nothing to bill</EmptyTitle>
            <EmptyDescription>Every appointment is already on an invoice or cancelled.</EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" nativeButton={false} render={<Link href="/solutions/invoices" />}>
            Back to invoices
          </Button>
        </Empty>
      ) : (
        <CreateInvoiceForm
          clients={clients}
          clientId={clientId}
          visits={visits}
          businessDate={getBusinessDate(new Date())}
          isClientUnavailable={requestedId !== '' && clientId === ''}
          handedOffIds={handedOffIds(query.visits)}
        />
      )}
    </div>
  )
}
