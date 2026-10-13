import Link from 'next/link'
import { AlertCircle, MapPin, Pencil, Plus, RotateCcw } from 'lucide-react'

import { OUTLINE_PRESS_CLASS_NAME, PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import TabToolbar from '@/components/admin/detail-page/tab-toolbar'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import StatusBadge, { activeStateBadge } from '@/components/ui/status-badge'
import SubmitButton from '@/components/ui/submit-button'
import { archiveLocation, restoreLocation } from '@/lib/actions/clients'

export type LocationRow = {
	id: string
	label: string
	address: string
	notes: string | null
	is_active: boolean
	is_archived: boolean
}

// Interim body until ticket 05 replaces it: the old location cards, moved under the tab.

function LocationCard({
	location,
	clientId,
	isReadOnly,
}: {
	location: LocationRow
	clientId: string
	isReadOnly: boolean
}) {
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

			{isReadOnly ? null : (
				<CardFooter className="justify-between gap-2 border-t border-border">
					<Button
						variant="outline"
						className={OUTLINE_PRESS_CLASS_NAME}
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
								className={OUTLINE_PRESS_CLASS_NAME}
								label="Restore"
								pendingLabel="Restoring…"
								icon={<RotateCcw aria-hidden="true" />}
							/>
						) : (
							<SubmitButton
								variant="outline"
								className={OUTLINE_PRESS_CLASS_NAME}
								label="Archive"
								pendingLabel="Archiving…"
							/>
						)}
					</form>
				</CardFooter>
			)}
		</Card>
	)
}

// Locations is the default tab, so the bare client URL retries it.
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

function LocationsList({
	locations,
	clientId,
	isReadOnly,
}: {
	locations: LocationRow[]
	clientId: string
	isReadOnly: boolean
}) {
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
				<LocationCard key={location.id} location={location} clientId={clientId} isReadOnly={isReadOnly} />
			))}
		</div>
	)
}

type LocationsTabProps = {
	clientId: string
	// Null when the locations query failed.
	locations: LocationRow[] | null
	isReadOnly: boolean
}

export function LocationsTab({ clientId, locations, isReadOnly }: LocationsTabProps): React.ReactNode {
	return (
		<>
			<TabToolbar
				description="Service addresses for this client."
				action={
					isReadOnly ? undefined : (
						<Button
							className={PRESS_CLASS_NAME}
							render={<Link href={`/solutions/clients/${clientId}/locations/new`} />}
							nativeButton={false}
						>
							<Plus aria-hidden="true" data-icon="inline-start" />
							Add location
						</Button>
					)
				}
			/>
			{locations === null ? (
				<LocationsError clientId={clientId} />
			) : (
				<LocationsList locations={locations} clientId={clientId} isReadOnly={isReadOnly} />
			)}
		</>
	)
}
