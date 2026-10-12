'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Pencil, RotateCcw, Search, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useInvalidateAppointments } from '@/hooks/use-invalidate-appointments'
import { archiveClient, restoreClient } from '@/lib/actions/clients'

export type ClientWithLocationCount = {
	id: string
	name: string
	email: string | null
	phone: string | null
	notes: string | null
	is_active: boolean
	is_archived: boolean
	client_locations: Array<{ count: number }> | null
}

function getLocationCount(client: ClientWithLocationCount) {
	if (!client.client_locations || client.client_locations.length === 0) return 0
	return client.client_locations[0]?.count ?? 0
}

function shortNotes(notes: string | null) {
	if (!notes) return 'No notes added.'
	if (notes.length <= 120) return notes
	return `${notes.slice(0, 117)}...`
}

function ClientCard({ client, archived }: { client: ClientWithLocationCount; archived?: boolean }) {
	const invalidateAppointments = useInvalidateAppointments()
	const action = async (_formData: FormData) => {
		const result = await (archived ? restoreClient(client.id) : archiveClient(client.id))
		// The Client filter lists only active clients, so a change shows on the next view.
		if (result.success) void invalidateAppointments()
	}
	const locationCount = getLocationCount(client)
	return (
		<Card className="rounded-2xl border border-neutral-200 bg-white py-0 shadow-sm shadow-emerald-950/5">
			<CardHeader className="gap-2 border-b border-neutral-100 px-5 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<CardTitle className="truncate text-base font-semibold text-neutral-950">{client.name}</CardTitle>
						{client.email ? <p className="truncate text-xs text-neutral-500">{client.email}</p> : null}
						{client.phone ? <p className="truncate text-xs text-neutral-500">{client.phone}</p> : null}
					</div>
					<span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
						{locationCount} {locationCount === 1 ? 'location' : 'locations'}
					</span>
				</div>
			</CardHeader>
			<CardFooter className="justify-between border-neutral-100 px-5 py-3">
				{!archived ? (
					<div className="flex items-center gap-2">
						<Link
							href={`/solutions/clients/${client.id}`}
							className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
						>
							<Eye className="size-3.5" aria-hidden="true" />
							View
						</Link>
						<Link
							href={`/solutions/clients/${client.id}/edit`}
							className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
						>
							<Pencil className="size-3.5" aria-hidden="true" />
							Edit
						</Link>
					</div>
				) : (
					<span className="text-xs text-neutral-500">Archived client</span>
				)}
				<form action={action}>
					<Button
						type="submit"
						variant="outline"
						className={`cursor-pointer rounded-full px-3 text-xs font-medium ${
							archived
								? 'h-8 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
								: 'h-8 border-neutral-200 bg-white text-neutral-700 hover:bg-red-500/80'
						}`}
					>
						{archived ? (
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

export function ClientsList({
	clients,
	archivedClients,
}: {
	clients: ClientWithLocationCount[]
	archivedClients: ClientWithLocationCount[]
}) {
	const [query, setQuery] = useState('')
	const normalizedQuery = query.trim().toLowerCase()
	const filteredClients = clients.filter((client) => {
		if (!normalizedQuery) {
			return true
		}

		return (
			client.name.toLowerCase().includes(normalizedQuery) ||
			client.email?.toLowerCase().includes(normalizedQuery) ||
			client.phone?.toLowerCase().includes(normalizedQuery)
		)
	})

	return (
		<>
			{clients.length > 0 ? (
				<section className="space-y-4">
					<div className="relative">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
						<input
							type="text"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search clients…"
							className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 pl-10 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
						/>
					</div>

					{filteredClients.length > 0 ? (
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{filteredClients.map((client) => (
								<ClientCard key={client.id} client={client} />
							))}
						</div>
					) : (
						<div className="rounded-2xl border border-emerald-100 bg-white px-4 py-8 text-center text-sm text-neutral-600 shadow-sm shadow-emerald-950/5">
							No clients match your search.
						</div>
					)}
				</section>
			) : (
				<section className="rounded-2xl border border-emerald-100 bg-white p-10 shadow-sm shadow-emerald-950/5">
					<div className="mx-auto flex max-w-md flex-col items-center text-center">
						<div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
							<Users className="size-6" aria-hidden="true" />
						</div>
						<h2 className="text-lg font-semibold text-neutral-950">No clients yet</h2>
						<p className="mt-2 text-sm leading-6 text-neutral-600">
							Add your first client to begin scheduling work and assigning locations.
						</p>
					</div>
				</section>
			)}

			{archivedClients.length > 0 ? (
				<section>
					<details className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm shadow-emerald-950/5">
						<summary className="cursor-pointer list-none">
							<div className="flex items-center justify-between gap-3">
								<h2 className="text-base font-semibold text-neutral-950">Archived Clients</h2>
								<span className="rounded-full border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600">
									{archivedClients.length}
								</span>
							</div>
						</summary>
						<div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{archivedClients.map((client) => (
								<ClientCard key={client.id} client={client} archived />
							))}
						</div>
					</details>
				</section>
			) : null}
		</>
	)
}