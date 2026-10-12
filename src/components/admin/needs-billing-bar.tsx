'use client'

import Link from 'next/link'
import { FilePlus2, TriangleAlert, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { totalPrices } from '@/lib/appointments/overview'
import type { NeedsBillingAppointment } from '@/lib/invoices/payment-state-queries'
import { formatCents } from '@/lib/pricing/money'
import { cn } from '@/lib/utils'

type NeedsBillingBarProps = {
  // Every one is the same client's; empty hides the bar.
  selected: NeedsBillingAppointment[]
  onClear: () => void
  onMarkPaid: () => void
  // Payment methods are still loading, so the Mark paid dialog has nothing to offer yet.
  isMarkPaidLoading?: boolean
}

const NEW_INVOICE_PATH = '/solutions/invoices/new'
const ACTION_CLASS = 'transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]'

function createInvoiceHref(selected: NeedsBillingAppointment[]): string {
  const params = new URLSearchParams({
    client: selected[0]?.clientId ?? '',
    visits: selected.map((appointment) => appointment.id).join(','),
  })
  return `${NEW_INVOICE_PATH}?${params.toString()}`
}

// The floating bar over the Needs billing list. Always mounted so it can animate in and out.
export default function NeedsBillingBar({
  selected,
  onClear,
  onMarkPaid,
  isMarkPaidLoading = false,
}: NeedsBillingBarProps): React.ReactNode {
  const isOpen = selected.length > 0
  const total = totalPrices(selected.map((appointment) => appointment.livePriceCents))
  const clientName = selected[0]?.clientName ?? ''

  // From lg the admin sidebar (w-68) is visible, so the bar starts at its edge instead of covering it.
  return (
    <div
      inert={!isOpen}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur transition-[translate,opacity] lg:left-68',
        isOpen
          ? 'translate-y-0 opacity-100 duration-base ease-out-quart'
          : 'pointer-events-none translate-y-full opacity-0 duration-[140ms] ease-in-quart'
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex min-w-0 items-start justify-between gap-2 md:flex-1 md:items-center">
          <div className="min-w-0 space-y-0.5">
            <p aria-live="polite" className="flex min-w-0 gap-1 text-sm">
              <span className="shrink-0 font-semibold">{selected.length} selected</span>
              <span aria-hidden="true">·</span>
              <span className="min-w-0 truncate">{clientName}</span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 tabular-nums">{formatCents(total.totalCents)}</span>
            </p>
            {total.unpricedCount > 0 ? (
              <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span className="min-w-0">{total.unpricedCount} Unpriced: set the amount when marking paid.</span>
              </p>
            ) : null}
          </div>
          <Button variant="ghost" className={cn(ACTION_CLASS, 'md:hidden')} onClick={onClear}>
            Clear
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0 md:items-center">
          <Button variant="ghost" className={cn(ACTION_CLASS, 'hidden md:inline-flex')} onClick={onClear}>
            Clear
          </Button>
          <Button
            variant="outline"
            className={cn(ACTION_CLASS, 'active:bg-muted')}
            disabled={isMarkPaidLoading}
            aria-busy={isMarkPaidLoading || undefined}
            onClick={onMarkPaid}
          >
            {isMarkPaidLoading ? <Spinner className="size-4" /> : <Wallet aria-hidden="true" />}
            Mark paid
          </Button>
          <Button className={ACTION_CLASS} nativeButton={false} render={<Link href={createInvoiceHref(selected)} />}>
            <FilePlus2 aria-hidden="true" />
            Create invoice
          </Button>
        </div>
      </div>
    </div>
  )
}
