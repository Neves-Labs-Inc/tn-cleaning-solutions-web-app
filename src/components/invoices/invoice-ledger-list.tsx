'use client'

import { useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { FileText, Info, SearchX } from 'lucide-react'

import BulkIssueBar from '@/components/invoices/bulk-issue-bar'
import BulkIssueSkipped from '@/components/invoices/bulk-issue-skipped'
import InvoiceCardList from '@/components/invoices/invoice-card-list'
import InvoiceFilters from '@/components/invoices/invoice-filters'
import InvoiceTable from '@/components/invoices/invoice-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { useBulkIssue } from '@/hooks/use-bulk-issue'
import { useDraftSelection } from '@/hooks/use-draft-selection'
import {
  INVOICE_LIST_LIMIT,
  invoiceFilterToSearchParams,
  isInvoiceFilterActive,
  isSelectableDraft,
  parseInvoiceFilter,
  type ClientOption,
  type InvoiceFilter,
  type LedgerListRow,
} from '@/lib/invoices/view'
import { cn } from '@/lib/utils'

type InvoiceLedgerListProps = {
  rows: LedgerListRow[]
  // How many invoices were loaded before filtering, to tell a cut-off list from a complete one.
  loadedCount: number
  clients: ClientOption[]
  filter: InvoiceFilter
  businessDate: string
}

const INVOICES_PATH = '/solutions/invoices'

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'invoice' : 'invoices'}`
}

function EmptyList({ hasFilter, onClear }: { hasFilter: boolean; onClear: () => void }): React.ReactNode {
  const Icon = hasFilter ? SearchX : FileText

  return (
    <Empty className="rounded-lg border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{hasFilter ? 'No invoices match' : 'No invoices yet'}</EmptyTitle>
        <EmptyDescription>
          {hasFilter
            ? 'Try a different status, client, or search.'
            : 'Completed visits for clients with Automatic invoicing start a draft here.'}
        </EmptyDescription>
      </EmptyHeader>
      {hasFilter ? (
        <Button type="button" variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      ) : (
        <Button render={<Link href={`${INVOICES_PATH}/new`} />} nativeButton={false}>
          New invoice
        </Button>
      )}
    </Empty>
  )
}

export default function InvoiceLedgerList({
  rows,
  loadedCount,
  clients,
  filter,
  businessDate,
}: InvoiceLedgerListProps): React.ReactNode {
  const router = useRouter()
  const pathname = usePathname()
  const [isNavigating, startTransition] = useTransition()
  const [optimisticFilter, setOptimisticFilter] = useOptimistic(filter)
  const [clearCount, setClearCount] = useState(0)

  const selection = useDraftSelection(rows.filter(isSelectableDraft).map((row) => row.id))
  const bulk = useBulkIssue(rows, selection.clear)

  const selectableCount = rows.filter(isSelectableDraft).length
  const unpricedSelectedCount = rows.filter((row) => selection.isSelected(row.id) && row.has_unpriced).length
  const isFiltered = isInvoiceFilterActive(filter)
  const isBarOpen = selection.selectedCount > 0
  // A failed call's error belongs to that selection; it shouldn't greet the next one.
  if (!isBarOpen && bulk.error) bulk.resetError()

  function navigate(next: InvoiceFilter): void {
    const query = invoiceFilterToSearchParams(next).toString()
    startTransition(() => {
      setOptimisticFilter(next)
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    })
  }

  function handleClearFilters(): void {
    setClearCount((count) => count + 1)
    navigate(parseInvoiceFilter({}))
  }

  function renderClearButton(size: 'default' | 'sm'): React.ReactNode {
    return isFiltered ? (
      <Button type="button" variant="ghost" size={size} onClick={handleClearFilters}>
        Clear filters
      </Button>
    ) : null
  }

  const toolbar = (
    <div className="grid h-full">
      <div
        inert={isBarOpen}
        className={cn(
          'flex items-center justify-between gap-3 px-4 transition-opacity duration-fast [grid-area:1/1]',
          isBarOpen && 'pointer-events-none opacity-0',
        )}
      >
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {countLabel(rows.length)}
        </p>
        {renderClearButton('sm')}
      </div>
      <BulkIssueBar
        placement="table-toolbar"
        bulk={bulk}
        selection={selection}
        selectableCount={selectableCount}
        unpricedSelectedCount={unpricedSelectedCount}
        businessDate={businessDate}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <InvoiceFilters
        key={clearCount}
        filter={optimisticFilter}
        clients={clients}
        onChange={(patch) => navigate({ ...optimisticFilter, ...patch })}
      />

      {bulk.skips ? <BulkIssueSkipped skips={bulk.skips} onDismiss={bulk.dismissSkips} /> : null}

      {loadedCount >= INVOICE_LIST_LIMIT ? (
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>Showing the {INVOICE_LIST_LIMIT.toLocaleString('en-CA')} most recently created invoices</AlertTitle>
          <AlertDescription>Invoices created before these aren&apos;t listed here.</AlertDescription>
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyList hasFilter={isFiltered} onClear={handleClearFilters} />
      ) : (
        <div
          aria-busy={isNavigating}
          className={cn('transition-opacity duration-fast', isNavigating && 'opacity-60', isBarOpen && 'pb-48 xl:pb-0')}
        >
          <div className="mb-3 flex min-h-11 items-center justify-between gap-3 xl:hidden">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {countLabel(rows.length)}
            </p>
            {renderClearButton('default')}
          </div>
          <InvoiceCardList rows={rows} businessDate={businessDate} selection={selection} isDisabled={bulk.isPending} />
          <InvoiceTable
            rows={rows}
            businessDate={businessDate}
            selection={selection}
            isDisabled={bulk.isPending}
            toolbar={toolbar}
          />
        </div>
      )}

      <BulkIssueBar
        placement="fixed-bottom"
        bulk={bulk}
        selection={selection}
        selectableCount={selectableCount}
        unpricedSelectedCount={unpricedSelectedCount}
        businessDate={businessDate}
      />
    </div>
  )
}
