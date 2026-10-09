import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Pencil, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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

	return (
		<Card className="rounded-2xl border border-neutral-200 bg-white py-0 shadow-sm shadow-emerald-950/5">
			<CardHeader className="gap-2 border-b border-neutral-100 px-5 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<CardTitle className="truncate text-base font-semibold text-neutral-950">{location.label}</CardTitle>
						<p className="mt-1 text-sm text-neutral-600">{location.address}</p>
					</div>
					<span
						className={`rounded-full px-2 py-1 text-xs font-medium ${
							location.is_active
								? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
								: 'border border-neutral-200 bg-neutral-100 text-neutral-600'
						}`}
					>
						{location.is_active ? 'Active' : 'Inactive'}
					</span>
				</div>
			</CardHeader>

			<CardContent className="px-5 py-4">
				<p className="text-sm leading-6 text-neutral-600">{location.notes || 'No notes added.'}</p>
			</CardContent>

			<CardFooter className="justify-between border-t border-neutral-100 px-5 py-3">
				<Link
					href={`/solutions/clients/${clientId}/locations/${location.id}/edit`}
					className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
				>
					<Pencil className="size-3.5" aria-hidden="true" />
					Edit
				</Link>

				<form action={handleLocationStateChange}>
					<input type="hidden" name="locationId" value={location.id} />
					<input type="hidden" name="isArchived" value={location.is_archived ? 'true' : 'false'} />
					<Button
						type="submit"
						variant="outline"
						className={`h-8 cursor-pointer rounded-full px-3 text-xs font-medium ${
							location.is_archived
								? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
								: 'border-neutral-200 bg-white text-neutral-700 hover:bg-red-500/80'
						}`}
					>
						{location.is_archived ? (
							<>
								<RotateCcw className="size-3.5" aria-hidden="true" />
								Restore
							</>
						) : (
							'Archive'
						)}
					</Button>
				</form>
			</CardFooter>
		</Card>
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

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-3">
						<Link
							href="/solutions/clients"
							className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
						>
							<ArrowLeft className="size-3.5" aria-hidden="true" />
							Back to Clients
						</Link>
						<div>
							<h1 className="text-3xl font-bold tracking-tight text-neutral-950">{client.name}</h1>
							<div className="mt-2 flex items-center gap-2">
								<span
									className={`rounded-full px-2 py-1 text-xs font-medium ${
										client.is_active
											? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
											: 'border border-neutral-200 bg-neutral-100 text-neutral-600'
									}`}
								>
									{client.is_active ? 'Active' : 'Inactive'}
								</span>
								{client.is_archived ? (
									<span className="rounded-full border border-neutral-200 bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
										Archived
									</span>
								) : null}
							</div>
						</div>
					</div>

					<div className="flex flex-wrap gap-2">
						<Link href={`/solutions/clients/${client.id}/pricing`}>
							<Button className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
								Custom Pricing
							</Button>
						</Link>
						<Link href={`/solutions/clients/${client.id}/edit`}>
							<Button className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
								<Pencil className="size-4" aria-hidden="true" />
								Edit Client
							</Button>
						</Link>
					</div>
				</div>
			</section>

			<BillingSection client={client} receivables={receivables} businessDate={getBusinessDate(new Date())} />

			<section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
				<h2 className="text-lg font-semibold text-neutral-950">Client Info</h2>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Email</p>
						<p className="mt-1 text-sm text-neutral-700">{client.email || 'Not provided'}</p>
					</div>
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Phone</p>
						<p className="mt-1 text-sm text-neutral-700">{client.phone || 'Not provided'}</p>
					</div>
				</div>
				<div className="mt-4">
					<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Notes</p>
					<p className="mt-1 text-sm leading-6 text-neutral-700">{client.notes || 'No notes added.'}</p>
				</div>
			</section>

			<section className="space-y-4">
				<div className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-lg font-semibold text-neutral-950">Locations</h2>
							<p className="mt-1 text-sm text-neutral-600">Manage all service addresses for this client.</p>
						</div>
						<Link href={`/solutions/clients/${client.id}/locations/new`}>
							<Button className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
								Add Location
							</Button>
						</Link>
					</div>
				</div>

				{locationsError ? (
					<section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
						{locationsError.message}
					</section>
				) : null}

				{(locations?.length ?? 0) > 0 ? (
					<div className="grid gap-4 md:grid-cols-2">
						{(locations ?? []).map((location) => (
							<LocationCard key={location.id} location={location as LocationRow} clientId={client.id} />
						))}
					</div>
				) : (
					<section className="rounded-2xl border border-emerald-100 bg-white p-10 shadow-sm shadow-emerald-950/5">
						<div className="mx-auto flex max-w-md flex-col items-center text-center">
							<div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
								<MapPin className="size-6" aria-hidden="true" />
							</div>
							<h3 className="text-lg font-semibold text-neutral-950">No locations yet</h3>
							<p className="mt-2 text-sm leading-6 text-neutral-600">
								Add a location to assign appointments to a specific service address.
							</p>
						</div>
					</section>
				)}
			</section>
		</div>
	)
}
