'use client'

import Link from 'next/link'

import InvoiceBadges from '@/components/invoices/invoice-badges'
import { Checkbox } from '@/components/ui/checkbox'
import type { DraftSelection } from '@/hooks/use-draft-selection'
import { dueLabel, invoiceLabel, isSelectableDraft, type LedgerListRow } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

type InvoiceCardListProps = {
  rows: LedgerListRow[]
  businessDate: string
  selection: DraftSelection
  isDisabled: boolean
}

type InvoiceCardProps = Omit<InvoiceCardListProps, 'rows'> & { row: LedgerListRow }

// Only issued and overdue rows have a due date worth a second glance; the number alone says the rest.
function subtitleFor(row: LedgerListRow, businessDate: string): string {
  const isOwed = row.effective_status === 'issued' || row.effective_status === 'overdue'
  return isOwed ? `${invoiceLabel(row)} · ${dueLabel(row, businessDate)}` : invoiceLabel(row)
}

function InvoiceCard({ row, businessDate, selection, isDisabled }: InvoiceCardProps): React.ReactNode {
  const isSelected = selection.isSelected(row.id)

  return (
    <li
      className={cn(
        'flex items-stretch rounded-lg bg-card ring-1 ring-foreground/10 transition-[background-color,box-shadow] duration-fast md:hover:ring-foreground/20',
        isSelected && 'ring-2 ring-primary md:hover:ring-primary',
      )}
    >
      {isSelectableDraft(row) ? (
        <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center rounded-l-lg border-r border-border transition-colors duration-fast active:bg-muted md:hover:bg-muted">
          <Checkbox
            checked={isSelected}
            disabled={isDisabled}
            aria-label={`Select draft for ${row.client_name}`}
            onCheckedChange={() => selection.toggle(row.id)}
          />
        </label>
      ) : null}
      <Link
        href={`/solutions/invoices/${row.id}`}
        className="min-h-16 min-w-0 flex-1 cursor-pointer rounded-lg p-4 outline-none transition-[background-color,box-shadow] duration-fast focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-semibold break-words">{row.client_name}</p>
          <p className="shrink-0 text-base font-semibold tabular-nums">{formatCents(row.total_cents)}</p>
        </div>
        <p className="text-sm text-muted-foreground">{subtitleFor(row, businessDate)}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <InvoiceBadges row={row} />
        </div>
      </Link>
    </li>
  )
}

export default function InvoiceCardList({ rows, ...rest }: InvoiceCardListProps): React.ReactNode {
  return (
    <ul className="space-y-3 xl:hidden">
      {rows.map((row) => (
        <InvoiceCard key={row.id} row={row} {...rest} />
      ))}
    </ul>
  )
}
