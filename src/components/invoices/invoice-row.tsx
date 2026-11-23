import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { invoiceSubtitle, invoiceTitle, type ClientInvoiceRow } from '@/lib/invoices/client-invoices'
import { invoiceHref } from '@/lib/invoices/paths'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

import InvoiceBadges from './invoice-badges'

const STAGGER_STEP_MS = 40
const MAX_STAGGERED_ROWS = 8

type InvoiceRowProps = {
  invoice: ClientInvoiceRow
  clientId: string
  // Set on rows revealed by Show archived: only they animate in.
  isRevealed?: boolean
  index: number
}

// One invoice on the client's Billing tab: the whole row opens it. The trailing size-11 slot holds
// the PDF download where there is one, and stays on every row so the titles line up.
export default function InvoiceRow({ invoice, clientId, index, isRevealed = false }: InvoiceRowProps) {
  return (
    <li
      className={cn(
        'flex items-center pr-1',
        isRevealed && 'animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-base ease-out-quart'
      )}
      style={isRevealed ? { animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS - 1) * STAGGER_STEP_MS}ms` } : undefined}
    >
      <Link
        href={invoiceHref(clientId, invoice.id)}
        className="flex min-h-16 min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3 transition-[background-color] duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-muted md:hover:bg-muted"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold break-words">{invoiceTitle(invoice)}</p>
          <p className="text-sm text-muted-foreground">{invoiceSubtitle(invoice)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="text-sm font-semibold tabular-nums">{formatCents(invoice.total_cents)}</p>
          <div className="flex gap-1">
            <InvoiceBadges row={invoice} />
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
      {/* Ticket 09 puts the PDF download here. */}
      <span className="ml-2 size-11 shrink-0" />
    </li>
  )
}
