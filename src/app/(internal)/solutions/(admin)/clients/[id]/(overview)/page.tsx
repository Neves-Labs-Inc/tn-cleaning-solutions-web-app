import { notFound } from 'next/navigation'

import DetailHeader from '@/components/admin/detail-page/detail-header'
import UrlTabs from '@/components/admin/detail-page/url-tabs'
import StatusBadge, { activeStateBadge, ARCHIVED_BADGE } from '@/components/ui/status-badge'
import { parseTabParam } from '@/lib/admin/tab-param'
import { CLIENT_TABS, DEFAULT_CLIENT_TAB } from '@/lib/clients/client-page'
import { InvoiceLedger } from '@/lib/invoices/ledger'
import { getClientBilling } from '@/lib/invoices/queries'
import { getBusinessDate } from '@/lib/schedule/business-time'
import { createClient } from '@/lib/supabase/server'
import { BillingSection } from './billing-section'
import { ClientArchiveButton } from './client-archive-button'
import { ClientEditDialog } from './client-edit-dialog'
import { ClientInfoCard } from './client-info-card'
import { loadPricingTab } from './load-pricing-tab'
import { LocationsTab, type LocationRow } from './locations-tab'
import { PricingTab } from './pricing-tab'

type ClientDetailPageProps = {
	params: Promise<{ id: string }>
	searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

// The Billing tab's reads plus the payment methods Mark paid offers. A failure stays in the tab.
async function loadBilling(supabase: Awaited<ReturnType<typeof createClient>>, clientId: string) {
	try {
		const [billing, methods] = await Promise.all([
			getClientBilling(supabase, clientId),
			new InvoiceLedger(supabase).listPaymentMethods(),
		])
		if (!methods.ok) throw new Error(`Couldn't load payment methods: ${methods.message}`)
		return { ...billing, methods: methods.data }
	} catch (error) {
		console.error('Failed to load billing for client', clientId, error)
		return null
	}
}

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
	const [{ id }, { tab, pick }] = await Promise.all([params, searchParams])
	const activeTab = parseTabParam(tab, CLIENT_TABS, DEFAULT_CLIENT_TAB)
	const supabase = await createClient()

	// Every tab is built here, so switching tabs never waits on the server. Each query's failure stays in its tab.
	const [
		{ data: client, error: clientError },
		{ data: locations, error: locationsError },
		pricing,
		billing,
	] = await Promise.all([
		supabase
			.from('clients')
			.select('id, name, email, phone, notes, is_active, is_archived')
			.eq('id', id)
			.maybeSingle(),
		supabase
			.from('client_locations')
			.select('id, label, address, notes, is_active, is_archived')
			.eq('client_id', id)
			.order('is_archived', { ascending: true })
			.order('label', { ascending: true }),
		loadPricingTab(supabase, id),
		loadBilling(supabase, id),
	])

	if (clientError || !client) {
		notFound()
	}

	if (locationsError) console.error('Failed to load locations for client', id, locationsError)

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
					// Archived wins over Active/Inactive, as in the clients list.
					client.is_archived ? (
						<StatusBadge tone={ARCHIVED_BADGE.tone} className="animate-in fade-in-0 zoom-in-95 duration-base">
							{ARCHIVED_BADGE.label}
						</StatusBadge>
					) : (
						<StatusBadge tone={activeBadge.tone}>{activeBadge.label}</StatusBadge>
					)
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
								data={pricing}
								today={businessDate}
								isReadOnly={isReadOnly}
							/>
						),
					},
					{
						value: 'billing',
						label: 'Billing',
						content: (
							<BillingSection
								client={client}
								billing={billing}
								businessDate={businessDate}
								pick={typeof pick === 'string' ? pick : undefined}
							/>
						),
					},
				]}
			/>
		</div>
	)
}
