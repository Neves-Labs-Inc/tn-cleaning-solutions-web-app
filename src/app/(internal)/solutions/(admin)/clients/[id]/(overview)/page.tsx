import { notFound } from 'next/navigation'

import type { ClientJobPricingRow } from '@/components/admin/client-job-pricing-list'
import DetailHeader from '@/components/admin/detail-page/detail-header'
import UrlTabs from '@/components/admin/detail-page/url-tabs'
import StatusBadge, { activeStateBadge, ARCHIVED_BADGE } from '@/components/ui/status-badge'
import { parseTabParam } from '@/lib/admin/tab-param'
import { CLIENT_TABS, DEFAULT_CLIENT_TAB } from '@/lib/clients/client-page'
import { getReceivables } from '@/lib/invoices/queries'
import { getBusinessDate } from '@/lib/schedule/business-time'
import { createClient } from '@/lib/supabase/server'
import { BillingSection } from './billing-section'
import { ClientArchiveButton } from './client-archive-button'
import { ClientEditDialog } from './client-edit-dialog'
import { ClientInfoCard } from './client-info-card'
import { LocationsTab, type LocationRow } from './locations-tab'
import { PricingTab } from './pricing-tab'

type ClientDetailPageProps = {
	params: Promise<{ id: string }>
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

type PricingQueryRow = {
	id: string
	job_id: string
	hourly_rate_cents: number
	effective_from: string
	notes: string | null
	is_archived: boolean
	jobs: { name: string } | { name: string }[]
}

function toPricingRow(row: PricingQueryRow): ClientJobPricingRow {
	const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs

	return {
		id: row.id,
		job_id: row.job_id,
		job_name: job?.name ?? '',
		hourly_rate_cents: row.hourly_rate_cents,
		effective_from: row.effective_from,
		notes: row.notes,
		is_archived: row.is_archived,
	}
}

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
	const [{ id }, { tab }] = await Promise.all([params, searchParams])
	const activeTab = parseTabParam(tab, CLIENT_TABS, DEFAULT_CLIENT_TAB)
	const supabase = await createClient()

	// Every tab is built here, so switching tabs never waits on the server. Each query's failure stays in its tab.
	const [
		{ data: client, error: clientError },
		{ data: locations, error: locationsError },
		{ data: pricing, error: pricingError },
		receivables,
	] = await Promise.all([
		supabase
			.from('clients')
			.select('id, name, email, phone, notes, is_active, is_archived, automatic_invoicing')
			.eq('id', id)
			.maybeSingle(),
		supabase
			.from('client_locations')
			.select('id, label, address, notes, is_active, is_archived')
			.eq('client_id', id)
			.order('is_archived', { ascending: true })
			.order('label', { ascending: true }),
		supabase
			.from('client_job_pricing')
			.select('id, job_id, hourly_rate_cents, effective_from, notes, is_archived, jobs!inner(name)')
			.eq('client_id', id)
			.order('effective_from', { ascending: false }),
		getReceivables(supabase, id).catch((error: unknown) => {
			console.error('Failed to load billing for client', id, error)
			return null
		}),
	])

	if (clientError || !client) {
		notFound()
	}

	if (locationsError) console.error('Failed to load locations for client', id, locationsError)
	if (pricingError) console.error('Failed to load pricing for client', id, pricingError)

	const businessDate = getBusinessDate(new Date())
	// An archived client is read-only: only Restore remains, and Locations and Pricing lose their controls.
	const isReadOnly = client.is_archived
	const activeBadge = activeStateBadge(client.is_active)

	return (
		<div className="animate-in space-y-6 duration-slow fade-in-0 lg:space-y-8">
			<DetailHeader
				backHref="/solutions/clients"
				backLabel="Clients"
				title={client.name}
				badges={
					<>
						<StatusBadge tone={activeBadge.tone}>{activeBadge.label}</StatusBadge>
						{client.is_archived ? (
							<StatusBadge
								tone={ARCHIVED_BADGE.tone}
								className="animate-in fade-in-0 zoom-in-95 duration-base"
							>
								{ARCHIVED_BADGE.label}
							</StatusBadge>
						) : null}
					</>
				}
				actions={
					<>
						{isReadOnly ? null : <ClientEditDialog client={client} />}
						<ClientArchiveButton clientId={client.id} clientName={client.name} isArchived={client.is_archived} />
					</>
				}
			/>

			<ClientInfoCard client={client} />

			<UrlTabs
				ariaLabel="Client sections"
				activeTab={activeTab}
				defaultTab={DEFAULT_CLIENT_TAB}
				tabs={[
					{
						value: 'locations',
						label: 'Locations',
						content: (
							<LocationsTab
								clientId={client.id}
								locations={locationsError ? null : ((locations ?? []) as LocationRow[])}
								isReadOnly={isReadOnly}
							/>
						),
					},
					{
						value: 'pricing',
						label: 'Pricing',
						content: (
							<PricingTab
								clientId={client.id}
								rows={pricingError ? null : ((pricing ?? []) as PricingQueryRow[]).map(toPricingRow)}
								today={businessDate}
								isReadOnly={isReadOnly}
							/>
						),
					},
					{
						value: 'billing',
						label: 'Billing',
						content: <BillingSection client={client} receivables={receivables} businessDate={businessDate} />,
					},
				]}
			/>
		</div>
	)
}
