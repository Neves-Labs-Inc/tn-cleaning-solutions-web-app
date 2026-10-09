'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import InvoiceBadges from '@/components/invoices/invoice-badges'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DraftSelection } from '@/hooks/use-draft-selection'
import {
  dueLabel,
  formatDateOnly,
  invoiceLabel,
  isSelectableDraft,
  type LedgerListRow,
} from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'

type InvoiceTableProps = {
  rows: LedgerListRow[]
  businessDate: string
  selection: DraftSelection
  isDisabled: boolean
  // The always-present h-14 row above the table: count and filters, or the bulk-issue controls.
  toolbar: React.ReactNode
}

export default function InvoiceTable({
  rows,
  businessDate,
  selection,
  isDisabled,
  toolbar,
}: InvoiceTableProps): React.ReactNode {
  const router = useRouter()
  const selectableCount = rows.filter(isSelectableDraft).length

  return (
    <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
      <div className="relative h-14 border-b">{toolbar}</div>
      <Table className="text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12 pl-4">
              <Checkbox
                aria-label="Select all drafts"
                checked={selection.isAllSelected}
                indeterminate={selection.isSomeSelected && !selection.isAllSelected}
                disabled={selectableCount === 0 || isDisabled}
                onCheckedChange={(checked) => (checked ? selection.selectAll() : selection.clear())}
              />
            </TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Issued</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="pr-4 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={selection.isSelected(row.id) ? 'selected' : undefined}
              className="h-14 cursor-pointer"
              onClick={() => router.push(`/solutions/invoices/${row.id}`)}
            >
              <TableCell className="w-12 pl-4" onClick={(event) => event.stopPropagation()}>
                {isSelectableDraft(row) ? (
                  <Checkbox
                    checked={selection.isSelected(row.id)}
                    disabled={isDisabled}
                    aria-label={`Select draft for ${row.client_name}`}
                    onCheckedChange={() => selection.toggle(row.id)}
                  />
                ) : null}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/solutions/invoices/${row.id}`}
                    className="-mx-1 rounded-sm px-1 py-0.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {invoiceLabel(row)}
                  </Link>
                  <InvoiceBadges row={row} part="tags" />
                </div>
              </TableCell>
              <TableCell>
                <span className="block max-w-48 truncate">{row.client_name}</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <InvoiceBadges row={row} part="status" />
                </div>
              </TableCell>
              <TableCell>
                {row.issued_date ? formatDateOnly(row.issued_date) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>{dueLabel(row, businessDate)}</TableCell>
              <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatCents(row.total_cents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
