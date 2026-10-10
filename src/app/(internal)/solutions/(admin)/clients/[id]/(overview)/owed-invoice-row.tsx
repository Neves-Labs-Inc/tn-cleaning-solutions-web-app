import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import StatusBadge, { invoiceStatusBadge } from '@/components/ui/status-badge'
import { dueLabel, invoiceLabel, type InvoiceViewRow } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'

const STAGGER_STEP_MS = 40
const MAX_STAGGERED_ROWS = 7
const NO_DUE_DATE = 'No due date'

type OwedInvoiceRowProps = {
	invoice: InvoiceViewRow
	businessDate: string
	index: number
}

export function OwedInvoiceRow({ invoice, businessDate, index }: OwedInvoiceRowProps) {
	const due = dueLabel(invoice, businessDate)
	const badge = invoiceStatusBadge(invoice.effective_status)

	return (
		<li>
			<Link
				href={`/solutions/invoices/${invoice.id}`}
				className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 transition-[background-color] animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-fast ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-muted md:hover:bg-muted"
				style={{
					animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_STEP_MS}ms`,
					// The hover transition is fast; the enter stays at the base duration.
					animationDuration: 'var(--duration-base)',
				}}
			>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold break-words">{invoiceLabel(invoice)}</p>
					<p className="text-sm text-muted-foreground">{due === NO_DUE_DATE ? due : `Due ${due}`}</p>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-1">
					<p className="text-sm font-semibold tabular-nums">{formatCents(invoice.total_cents)}</p>
					<StatusBadge tone={badge.tone} icon={badge.icon}>
						{badge.label}
					</StatusBadge>
				</div>
				<ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
			</Link>
		</li>
	)
}
