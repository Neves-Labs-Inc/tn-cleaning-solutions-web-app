import Link from 'next/link'
import { ArrowLeft, CircleOff, Pencil, ReceiptText } from 'lucide-react'
import { notFound } from 'next/navigation'

import { Button } from '@/components/ui/button'
import StatusBadge, { invoiceStatusBadge } from '@/components/ui/status-badge'
import {
	archiveInvoice,
	issueInvoice,
	markInvoicePaid,
	voidInvoice,
} from '@/lib/actions/invoices'
import { effectiveStatus, invoiceLabel } from '@/lib/invoices/view'
import { formatCents, formatRate } from '@/lib/pricing/money'
import { formatBusinessDateTime, getBusinessDate } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'

type InvoiceDetailPageProps = {
	params: Promise<{ id: string }>
}

type InvoiceDetailRow = {
	id: string
	status: 'draft' | 'issued' | 'paid' | 'void'
	issued_date: string | null
	invoice_number: string | null
	due_date: string | null
	total_cents: number
	notes: string | null
	is_archived: boolean
	created_at: string
	client_id: string
	clients: {
		id: string
		name: string
		email: string | null
		phone: string | null
	} | null
	invoice_appointments:
		| Array<{
				appointment_id: string
				billed_amount_cents: number
				billed_rate_cents: number | null
				billed_minutes: number | null
				appointments: {
					id: string
					scheduled_date: string
					scheduled_start_time: string
					scheduled_end_time: string
					notes: string | null
					jobs: {
						id: string
						name: string
					} | null
					client_locations: {
						label: string
						address: string
					} | null
				} | null
			}>
		| null
}

function formatDateValue(value: string | null) {
	if (!value) {
		return 'Not set'
	}

	const [year, month, day] = value.split('-').map(Number)
	const localDate = new Date(year, month - 1, day)
	return localDate.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	})
}

function formatDateTime(date: string, time: string) {
	return `${formatDateValue(date)} • ${time.slice(0, 5)}`
}

function rateBreakdown(rateCents: number | null, minutes: number | null) {
	let breakdown: string | null

	if (rateCents === null || minutes === null) {
		breakdown = null
	} else {
		breakdown = `${formatRate(rateCents)} × ${Math.floor(minutes / 60)}h ${minutes % 60}m`
	}

	return breakdown
}

export default async function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
	const { id } = await params
	const supabase = await createClient()

	// The view, not the table: total_cents is derived from the lines there.
	const { data, error } = await supabase
		.from('invoices_with_status')
		.select(
			`
				id, status, invoice_number, issued_date, due_date, total_cents, notes, is_archived, created_at, client_id,
				clients!inner ( id, name, email, phone ),
				invoice_appointments (
					appointment_id, billed_amount_cents, billed_rate_cents, billed_minutes,
					appointments!inner (
						id, scheduled_date, scheduled_start_time, scheduled_end_time, notes,
						jobs!inner ( id, name ),
						client_locations ( label, address )
					)
				)
			`
		)
		.eq('id', id)
		.single()

	const invoice = data as unknown as InvoiceDetailRow | null

	if (error || !invoice) {
		notFound()
	}

	const status = effectiveStatus(invoice, getBusinessDate(new Date()))
	const badge = invoiceStatusBadge(status)
	const overdue = status === 'overdue'

	const lines = (invoice.invoice_appointments ?? []).flatMap((row) =>
		row.appointments === null
			? []
			: [
					{
						appointment: row.appointments,
						billed_amount_cents: row.billed_amount_cents,
						breakdown: rateBreakdown(row.billed_rate_cents, row.billed_minutes),
					},
				]
	)

	const canEdit = invoice.status === 'draft'
	const canIssue = invoice.status === 'draft'
	const canMarkPaid = invoice.status === 'issued' || overdue
	const canVoid = invoice.status === 'draft' || invoice.status === 'issued'

	async function handleIssue(formData: FormData) {
		'use server'

		await issueInvoice(String(formData.get('id') ?? ''))
	}

	async function handleMarkPaid(formData: FormData) {
		'use server'

		await markInvoicePaid(String(formData.get('id') ?? ''))
	}

	async function handleVoid(formData: FormData) {
		'use server'

		await voidInvoice(String(formData.get('id') ?? ''))
	}

	async function handleArchive(formData: FormData) {
		'use server'

		await archiveInvoice(String(formData.get('id') ?? ''))
	}

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
					<div className="space-y-3">
						<Link
							href="/solutions/invoices"
							className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
						>
							<ArrowLeft className="size-3.5" aria-hidden="true" />
							Back to Invoices
						</Link>

						<div>
							<h1 className="text-3xl font-bold tracking-tight text-neutral-950">{invoiceLabel(invoice)}</h1>
							<p className="mt-2 text-sm text-neutral-600">Client billing details and status controls.</p>
						</div>

						<StatusBadge tone={badge.tone} icon={badge.icon} className="w-fit">
							{badge.label}
						</StatusBadge>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{canEdit ? (
							<Link href={`/solutions/invoices/${invoice.id}/edit`}>
								<Button className="h-10 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
									<Pencil className="size-4" aria-hidden="true" />
									Edit
								</Button>
							</Link>
						) : null}

						{canIssue ? (
							<form action={handleIssue}>
								<input type="hidden" name="id" value={invoice.id} />
								<Button type="submit" variant="outline" className="h-10 rounded-full border-amber-200 text-amber-700 hover:bg-amber-50">
									Issue Invoice
								</Button>
							</form>
						) : null}

						{canMarkPaid ? (
							<form action={handleMarkPaid}>
								<input type="hidden" name="id" value={invoice.id} />
								<Button type="submit" variant="outline" className="h-10 rounded-full border-emerald-200 text-emerald-700 hover:bg-emerald-50">
									Mark as Paid
								</Button>
							</form>
						) : null}

						{canVoid ? (
							<form action={handleVoid}>
								<input type="hidden" name="id" value={invoice.id} />
								<Button type="submit" variant="outline" className="h-10 rounded-full border-red-200 text-red-700 hover:bg-red-50">
									Void
								</Button>
							</form>
						) : null}

						{!invoice.is_archived ? (
							<form action={handleArchive}>
								<input type="hidden" name="id" value={invoice.id} />
								<Button type="submit" variant="outline" className="h-10 rounded-full border-neutral-200 text-neutral-700 hover:bg-neutral-50">
									Archive
								</Button>
							</form>
						) : null}
					</div>
				</div>
			</section>

			<section className="grid gap-6 xl:grid-cols-3">
				<div className="space-y-6 xl:col-span-2">
					<article className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
						<h2 className="text-lg font-semibold text-neutral-950">Client</h2>
						<div className="mt-4 space-y-1 text-sm text-neutral-700">
							<p className="font-semibold text-neutral-950">{invoice.clients?.name ?? 'Unknown client'}</p>
							<p>{invoice.clients?.email ?? 'No email on file'}</p>
							<p>{invoice.clients?.phone ?? 'No phone on file'}</p>
						</div>
					</article>

					<article className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
						<h2 className="text-lg font-semibold text-neutral-950">Invoice Metadata</h2>

						<div className="mt-4 grid gap-4 sm:grid-cols-3">
							<div>
								<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Issue Date</p>
								<p className="mt-1 text-sm text-neutral-700">{formatDateValue(invoice.issued_date)}</p>
							</div>
							<div>
								<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Due Date</p>
								<p className="mt-1 text-sm text-neutral-700">{formatDateValue(invoice.due_date)}</p>
							</div>
							<div>
								<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Created</p>
								<p className="mt-1 text-sm text-neutral-700">{formatBusinessDateTime(new Date(invoice.created_at))}</p>
							</div>
						</div>

						<div className="mt-4 space-y-1.5">
							<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Notes</p>
							<p className="text-sm leading-6 text-neutral-700">{invoice.notes?.trim() || 'No notes added.'}</p>
						</div>
					</article>

					<article className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
						<h2 className="text-lg font-semibold text-neutral-950">Appointments</h2>

						{overdue ? (
							<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
								This invoice is overdue because the due date has passed and status is still issued.
							</div>
						) : null}

						{lines.length > 0 ? (
							<div className="mt-4 overflow-x-auto">
								<table className="min-w-full border-collapse text-left text-sm">
									<thead>
										<tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
											<th className="px-2 py-2">Date</th>
											<th className="px-2 py-2">Time</th>
											<th className="px-2 py-2">Job</th>
											<th className="px-2 py-2">Location</th>
											<th className="px-2 py-2 text-right">Price</th>
										</tr>
									</thead>
									<tbody>
										{lines.map((line) => (
											<tr key={line.appointment.id} className="border-b border-neutral-100 text-neutral-700">
												<td className="px-2 py-2">{formatDateValue(line.appointment.scheduled_date)}</td>
												<td className="px-2 py-2">
													{line.appointment.scheduled_start_time.slice(0, 5)} - {line.appointment.scheduled_end_time.slice(0, 5)}
												</td>
												<td className="px-2 py-2">{line.appointment.jobs?.name ?? 'Unknown job'}</td>
												<td className="px-2 py-2">
													{[line.appointment.client_locations?.label, line.appointment.client_locations?.address]
														.filter(Boolean)
														.join(' - ') || 'No location'}
												</td>
												<td className="px-2 py-2 text-right font-medium text-neutral-900">
													{formatCents(line.billed_amount_cents)}
													{line.breakdown ? (
														<span className="block text-xs font-normal text-neutral-500">{line.breakdown}</span>
													) : null}
												</td>
											</tr>
										))}
									</tbody>
									<tfoot>
										<tr className="border-t border-neutral-200">
											<td colSpan={4} className="px-2 py-3 text-right text-sm font-semibold text-neutral-900">
												Total
											</td>
											<td className="px-2 py-3 text-right text-sm font-bold text-neutral-950">
												{formatCents(invoice.total_cents)}
											</td>
										</tr>
									</tfoot>
								</table>
							</div>
						) : (
							<div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm text-neutral-600">
								No appointments linked to this invoice.
							</div>
						)}
					</article>
				</div>

				<div className="space-y-4">
					<article className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">Quick Facts</h2>
						<ul className="mt-3 space-y-2 text-sm text-neutral-700">
							<li className="flex items-center gap-2">
								<ReceiptText className="size-4 text-emerald-600" aria-hidden="true" />
								{invoiceLabel(invoice)}
							</li>
							<li className="flex items-center gap-2">
								<CircleOff className="size-4 text-neutral-500" aria-hidden="true" />
								{lines.length} appointment{lines.length === 1 ? '' : 's'}
							</li>
							<li className="text-neutral-900">Total: {formatCents(invoice.total_cents)}</li>
						</ul>
					</article>
				</div>
			</section>
		</div>
	)
}
