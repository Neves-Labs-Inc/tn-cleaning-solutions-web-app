import Link from 'next/link'
import { AlertCircle, ArrowRight, CircleCheck, Plus, ReceiptText } from 'lucide-react'

import AutomaticInvoicingSwitch from '@/components/admin/automatic-invoicing-switch'
import { OUTLINE_PRESS_CLASS_NAME, PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import TabToolbar from '@/components/admin/detail-page/tab-toolbar'
import UnbilledVisitList from '@/components/invoices/unbilled-visit-list'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import StatTile from '@/components/ui/stat-tile'
import type { Receivables } from '@/lib/invoices/queries'
import { owedInvoices, unbilledSummary } from '@/lib/invoices/view'
import { formatCents } from '@/lib/pricing/money'
import { OwedInvoiceRow } from './owed-invoice-row'

const CARD_CLASS_NAME = 'overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-foreground/10'

type BillingSectionProps = {
	client: { id: string; name: string; automatic_invoicing: boolean }
	// Null when the billing queries failed: the switch still renders, the rest becomes an error.
	receivables: Receivables | null
	businessDate: string
}

function pluralize(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function BillingError({ clientId }: { clientId: string }) {
	return (
		<Alert variant="destructive" className="has-data-[slot=alert-action]:pr-28">
			<AlertCircle aria-hidden="true" />
			<AlertTitle>Couldn&apos;t load billing</AlertTitle>
			<AlertDescription>Client info is fine; the invoices for this client didn&apos;t load.</AlertDescription>
			<AlertAction>
				<Button
					variant="outline"
					className="text-foreground"
					render={<Link href={`/solutions/clients/${clientId}?tab=billing`} />}
					nativeButton={false}
				>
					Try again
				</Button>
			</AlertAction>
		</Alert>
	)
}

// Tiles come from invoice_receivables_totals scoped to this client, so they're right at any volume.
function BalanceTiles({ receivables }: { receivables: Receivables }) {
	const { totals } = receivables
	const overdueCount = receivables.owed.filter((invoice) => invoice.effective_status === 'overdue').length

	return (
		<>
			<StatTile
				label="Owed"
				value={formatCents(totals.outstandingCents)}
				caption={totals.unpaidCount > 0 ? pluralize(totals.unpaidCount, 'issued invoice') : 'Nothing owed'}
				fitValue
			/>
			<StatTile
				label="Overdue"
				value={formatCents(totals.overdueCents)}
				caption={overdueCount > 0 ? `${overdueCount} past due` : 'Nothing past due'}
				fitValue
			/>
		</>
	)
}

function OwedInvoices({ receivables, businessDate }: { receivables: Receivables; businessDate: string }) {
	const owed = owedInvoices(receivables.owed)

	return (
		<div className="space-y-3">
			<h3 className="text-base font-semibold">
				Owed invoices <span className="text-sm font-normal text-muted-foreground tabular-nums">· {owed.length}</span>
			</h3>
			<div className={CARD_CLASS_NAME}>
				{owed.length > 0 ? (
					<ul className="divide-y divide-border">
						{owed.map((invoice, index) => (
							<OwedInvoiceRow key={invoice.id} invoice={invoice} businessDate={businessDate} index={index} />
						))}
					</ul>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ReceiptText aria-hidden="true" />
							</EmptyMedia>
							<EmptyTitle>Nothing owed</EmptyTitle>
							<EmptyDescription>Issued invoices for this client will show here.</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</div>
		</div>
	)
}

function UnbilledVisits({ receivables }: { receivables: Receivables }) {
	const summary = unbilledSummary(receivables.unbilled)

	return (
		<div className="space-y-3">
			<h3 className="text-base font-semibold">
				Unbilled appointments{' '}
				<span className="text-sm font-normal text-muted-foreground tabular-nums">
					· {summary.count} · {formatCents(summary.pricedCents)}
				</span>
				{summary.unpricedCount > 0 ? (
					<span className="ml-1 text-xs font-normal text-muted-foreground">+ {summary.unpricedCount} unpriced</span>
				) : null}
			</h3>
			<div className={CARD_CLASS_NAME}>
				{summary.count > 0 ? (
					<UnbilledVisitList visits={receivables.unbilled} />
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<CircleCheck aria-hidden="true" />
							</EmptyMedia>
							<EmptyTitle>No unbilled appointments</EmptyTitle>
							<EmptyDescription>Every completed appointment is on an invoice.</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</div>
		</div>
	)
}

export function BillingSection({ client, receivables, businessDate }: BillingSectionProps) {
	return (
		// The Billing tab labels this panel, so it has no heading of its own.
		<div className="space-y-4">
			<TabToolbar
				description="Invoices and balances for this client."
				action={
					<>
						<Button
							className={`sm:order-last ${PRESS_CLASS_NAME}`}
							render={<Link href={`/solutions/invoices/new?client=${client.id}`} />}
							nativeButton={false}
						>
							<Plus aria-hidden="true" data-icon="inline-start" />
							New invoice
						</Button>
						<Button
							variant="outline"
							className={OUTLINE_PRESS_CLASS_NAME}
							render={<Link href="/solutions/invoices/receivables" />}
							nativeButton={false}
						>
							Receivables
							<ArrowRight aria-hidden="true" data-icon="inline-end" />
						</Button>
					</>
				}
			/>

			{receivables === null ? (
				<>
					<BillingError clientId={client.id} />
					<AutomaticInvoicingSwitch clientId={client.id} clientName={client.name} isOn={client.automatic_invoicing} />
				</>
			) : (
				<>
					<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
						<BalanceTiles receivables={receivables} />
						<div className="col-span-2">
							<AutomaticInvoicingSwitch
								clientId={client.id}
								clientName={client.name}
								isOn={client.automatic_invoicing}
							/>
						</div>
					</div>
					<div className="grid gap-6 lg:grid-cols-2 lg:items-start">
						<OwedInvoices receivables={receivables} businessDate={businessDate} />
						<UnbilledVisits receivables={receivables} />
					</div>
				</>
			)}
		</div>
	)
}
