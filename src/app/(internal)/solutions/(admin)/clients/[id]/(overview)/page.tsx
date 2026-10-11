import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertCircle, ArrowLeft, MapPin, Pencil, Plus, RotateCcw } from 'lucide-react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import PageHeader from '@/components/ui/page-header'
import StatusBadge, { activeStateBadge, ARCHIVED_BADGE } from '@/components/ui/status-badge'
import SubmitButton from '@/components/ui/submit-button'
import { archiveLocation, restoreLocation } from '@/lib/actions/clients'
import { getReceivables } from '@/lib/invoices/queries'
import { getBusinessDate } from '@/lib/schedule/business-time'
import { createClient } from '@/lib/supabase/server'
import { BillingSection } from './billing-section'

type ClientDetailPageProps = {
	params: Promise<{ id: string }>
}

type LocationRow = {
	id: string
	label: string
	address: string
	notes: string | null
	is_active: boolean
	is_archived: boolean
}

const PRESS_CLASS_NAME =
	'transition-[background-color,transform,box-shadow] duration-fast ease-out-quart active:scale-[0.98]'
const HEADER_BUTTON_CLASS_NAME = `w-full sm:w-auto ${PRESS_CLASS_NAME}`
const SECTION_TITLE_CLASS_NAME = 'text-lg font-semibold tracking-tight'
const TERM_CLASS_NAME = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'
const DETAIL_CLASS_NAME = 'text-sm leading-6 text-foreground break-words'

function LocationCard({ location, clientId }: { location: LocationRow; clientId: string }) {
	async function handleLocationStateChange(formData: FormData) {
		'use server'

		const locationId = String(formData.get('locationId') ?? '')
		const isArchived = String(formData.get('isArchived') ?? '') === 'true'

		if (!locationId) {
			return
		}

		if (isArchived) {
			await restoreLocation(locationId)
			return
		}

		await archiveLocation(locationId)
	}

	const activeBadge = activeStateBadge(location.is_active)

	return (
		<Card>
			<CardHeader className="gap-2">
				<div className="flex items-start justify-between gap-3">
					<CardTitle className="min-w-0 text-base font-semibold break-words">{location.label}</CardTitle>
					<StatusBadge tone={activeBadge.tone}>{activeBadge.label}</StatusBadge>
				</div>
				<p className="text-sm text-muted-foreground break-words">{location.address}</p>
			</CardHeader>

			<CardContent>
				<p className="text-sm leading-6 text-muted-foreground break-words">{location.notes || 'No notes added.'}</p>
			</CardContent>

			<CardFooter className="justify-between gap-2 border-t border-border">
				<Button
					variant="outline"
					className={PRESS_CLASS_NAME}
					render={<Link href={`/solutions/clients/${clientId}/locations/${location.id}/edit`} />}
					nativeButton={false}
				>
					<Pencil aria-hidden="true" data-icon="inline-start" />
					Edit
				</Button>

				<form action={handleLocationStateChange}>
					<input type="hidden" name="locationId" value={location.id} />
					<input type="hidden" name="isArchived" value={location.is_archived ? 'true' : 'false'} />
					{location.is_archived ? (
						<SubmitButton
							variant="outline"
							className={PRESS_CLASS_NAME}
							label="Restore"
							pendingLabel="Restoring…"
							icon={<RotateCcw aria-hidden="true" />}
						/>
					) : (
						<SubmitButton
							variant="outline"
							className={PRESS_CLASS_NAME}
							label="Archive"
							pendingLabel="Archiving…"
						/>
					)}
				</form>
			</CardFooter>
		</Card>
	)
}

function LocationsError({ clientId }: { clientId: string }) {
	return (
		<Alert variant="destructive" className="has-data-[slot=alert-action]:pr-28">
			<AlertCircle aria-hidden="true" />
			<AlertTitle>Couldn&apos;t load locations</AlertTitle>
			<AlertDescription>Client info is fine; this client&apos;s addresses didn&apos;t load.</AlertDescription>
			<AlertAction>
				<Button
					variant="outline"
					className="text-foreground"
					render={<Link href={`/solutions/clients/${clientId}`} />}
					nativeButton={false}
				>
					Try again
				</Button>
			</AlertAction>
		</Alert>
	)
}

function LocationsList({ locations, clientId }: { locations: LocationRow[]; clientId: string }) {
	if (locations.length === 0) {
		return (
			<Empty className="rounded-lg bg-card ring-1 ring-foreground/10">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<MapPin aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>No locations yet</EmptyTitle>
					<EmptyDescription>Add a location to assign appointments to a specific service address.</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}

	return (
		<div className="grid gap-3 md:grid-cols-2">
			{locations.map((location) => (
				<LocationCard key={location.id} location={location} clientId={clientId} />
			))}
		</div>
	)
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
	const { id } = await params
	const supabase = await createClient()

	const [{ data: client, error: clientError }, { data: locations, error: locationsError }, receivables] =
		await Promise.all([
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
			// A billing failure shows in the Billing section only: the rest of the page still renders.
			getReceivables(supabase, id).catch((error: unknown) => {
				console.error('Failed to load billing for client', id, error)
				return null
			}),
		])

	if (clientError || !client) {
		notFound()
	}

	const activeBadge = activeStateBadge(client.is_active)

	return (
		<div className="animate-in space-y-6 duration-slow fade-in-0 lg:space-y-8">
			<div className="min-w-0 space-y-3">
				<Button
					variant="ghost"
					className={`-ml-3 w-fit active:bg-muted ${PRESS_CLASS_NAME}`}
					render={<Link href="/solutions/clients" />}
					nativeButton={false}
				>
					<ArrowLeft aria-hidden="true" />
					Clients
				</Button>
				<PageHeader
					title={client.name}
					action={
						<div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
							<Button
								variant="outline"
								className={HEADER_BUTTON_CLASS_NAME}
								render={<Link href={`/solutions/clients/${client.id}/pricing`} />}
								nativeButton={false}
							>
								Custom pricing
							</Button>
							<Button
								variant="outline"
								className={HEADER_BUTTON_CLASS_NAME}
								render={<Link href={`/solutions/clients/${client.id}/edit`} />}
								nativeButton={false}
							>
								<Pencil aria-hidden="true" data-icon="inline-start" />
								Edit client
							</Button>
						</div>
					}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<StatusBadge tone={activeBadge.tone}>{activeBadge.label}</StatusBadge>
					{client.is_archived ? <StatusBadge tone={ARCHIVED_BADGE.tone}>{ARCHIVED_BADGE.label}</StatusBadge> : null}
				</div>
			</div>

			<BillingSection client={client} receivables={receivables} businessDate={getBusinessDate(new Date())} />

			<Card className="gap-4 p-4 sm:p-5">
				<h2 className={SECTION_TITLE_CLASS_NAME}>Client info</h2>
				<dl className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1">
						<dt className={TERM_CLASS_NAME}>Email</dt>
						<dd className={DETAIL_CLASS_NAME}>{client.email || 'Not provided'}</dd>
					</div>
					<div className="space-y-1">
						<dt className={TERM_CLASS_NAME}>Phone</dt>
						<dd className={DETAIL_CLASS_NAME}>{client.phone || 'Not provided'}</dd>
					</div>
					<div className="space-y-1 sm:col-span-2">
						<dt className={TERM_CLASS_NAME}>Notes</dt>
						<dd className={DETAIL_CLASS_NAME}>{client.notes || 'No notes added.'}</dd>
					</div>
				</dl>
			</Card>

			<section className="space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className={SECTION_TITLE_CLASS_NAME}>Locations</h2>
						<p className="text-sm text-muted-foreground">Manage all service addresses for this client.</p>
					</div>
					<Button
						variant="outline"
						className={HEADER_BUTTON_CLASS_NAME}
						render={<Link href={`/solutions/clients/${client.id}/locations/new`} />}
						nativeButton={false}
					>
						<Plus aria-hidden="true" data-icon="inline-start" />
						Add location
					</Button>
				</div>

				{locationsError ? (
					<LocationsError clientId={client.id} />
				) : (
					<LocationsList locations={(locations ?? []) as LocationRow[]} clientId={client.id} />
				)}
			</section>
		</div>
	)
}
