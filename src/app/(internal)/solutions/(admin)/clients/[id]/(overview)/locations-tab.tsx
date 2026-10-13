'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Archive, MapPin, Pencil, Plus, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

import { LocationForm } from '@/components/admin/location-form'
import {
	ITEM_META_CLASS_NAME,
	ITEM_PRIMARY_CLASS_NAME,
	ITEM_SECONDARY_CLASS_NAME,
	ItemListCard,
	ItemListEmpty,
	ItemRow,
	RowActions,
	TabLoadError,
} from '@/components/admin/detail-page/item-list'
import { OUTLINE_PRESS_CLASS_NAME, PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import TabToolbar from '@/components/admin/detail-page/tab-toolbar'
import { Button } from '@/components/ui/button'
import ResponsiveDialog from '@/components/ui/responsive-dialog'
import StatusBadge, { activeStateBadge, ARCHIVED_BADGE } from '@/components/ui/status-badge'
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

type DialogTarget = { mode: 'add' } | { mode: 'edit'; location: LocationRow }

type LocationItemProps = {
	location: LocationRow
	isReadOnly: boolean
	onEdit: (location: LocationRow) => void
}

function LocationItem({ location, isReadOnly, onEdit }: LocationItemProps): React.ReactNode {
	const router = useRouter()
	// Covers the change and the refresh after it, so the row can't run a change twice while it still
	// shows the old state.
	const [isPending, startPending] = useTransition()
	const badge = location.is_archived ? ARCHIVED_BADGE : activeStateBadge(location.is_active)
	const verb = location.is_archived ? 'restore' : 'archive'

	function handleStateChange(): void {
		if (isPending) return

		startPending(async () => {
			let isSaved = false
			try {
				const result = location.is_archived
					? await restoreLocation(location.id)
					: await archiveLocation(location.id)
				isSaved = result.success
			} catch (error) {
				console.error('Location state change failed', location.id, error)
			}

			if (!isSaved) {
				toast.error(`Couldn't ${verb} ${location.label}. Try again.`)
				return
			}
			toast.success(`${location.label} ${location.is_archived ? 'restored' : 'archived'}`)
			// A transition again after the await, so isPending holds until the refreshed list lands.
			startPending(() => router.refresh())
		})
	}

	// An archived location can't be edited (updateLocation refuses it), so it offers Restore only.
	const actions = isReadOnly ? undefined : (
		<RowActions>
			{location.is_archived ? null : (
				<Button
					variant="outline"
					className={OUTLINE_PRESS_CLASS_NAME}
					aria-label={`Edit ${location.label}`}
					disabled={isPending}
					onClick={() => onEdit(location)}
				>
					<Pencil aria-hidden="true" data-icon="inline-start" />
					Edit
				</Button>
			)}
			{/* Not inside a form, so its submit type does nothing; one element in both states keeps focus
			    on it when the row flips between Archive and Restore. */}
			<SubmitButton
				variant="outline"
				className={OUTLINE_PRESS_CLASS_NAME}
				aria-label={`${location.is_archived ? 'Restore' : 'Archive'} ${location.label}`}
				label={location.is_archived ? 'Restore' : 'Archive'}
				pendingLabel={location.is_archived ? 'Restoring…' : 'Archiving…'}
				icon={location.is_archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
				isPending={isPending}
				// aria-disabled instead of native disabled while pending: a disabled button drops focus to <body>.
				focusableWhenDisabled
				onClick={handleStateChange}
			/>
		</RowActions>
	)

	return (
		<ItemRow actions={actions}>
			<div className="flex items-start justify-between gap-3 sm:justify-start">
				<p className={`${ITEM_PRIMARY_CLASS_NAME} min-w-0`}>{location.label}</p>
				<StatusBadge tone={badge.tone} className="shrink-0">
					{badge.label}
				</StatusBadge>
			</div>
			<p className={ITEM_SECONDARY_CLASS_NAME}>{location.address}</p>
			<p className={`${ITEM_META_CLASS_NAME} whitespace-pre-line`}>{location.notes || 'No notes added.'}</p>
		</ItemRow>
	)
}

// Locations is the default tab, so the bare client URL retries it.
function LocationsError({ clientId }: { clientId: string }): React.ReactNode {
	return (
		<TabLoadError
			title="Couldn't load locations"
			description="Client info is fine; this client's addresses didn't load."
			retryHref={`/solutions/clients/${clientId}`}
		/>
	)
}

type LocationsTabProps = {
	clientId: string
	// Null when the locations query failed.
	locations: LocationRow[] | null
	isReadOnly: boolean
}

export function LocationsTab({ clientId, locations, isReadOnly }: LocationsTabProps): React.ReactNode {
	const router = useRouter()
	// Open and content are separate so the last form stays mounted, title and all, through the close animation.
	const [isDialogOpen, setIsDialogOpen] = useState(false)
	const [dialogTarget, setDialogTarget] = useState<DialogTarget>({ mode: 'add' })
	const [isDialogPending, setIsDialogPending] = useState(false)
	const addButtonRef = useRef<HTMLButtonElement>(null)

	const isEmpty = locations !== null && locations.length === 0
	const canAdd = !isReadOnly && locations !== null && !isEmpty
	const isEditing = dialogTarget.mode === 'edit'

	// The first add is opened from the Empty, which the refreshed list replaces; focus would fall to
	// <body>, so it moves to the toolbar's Add instead.
	const wasEmptyRef = useRef(isEmpty)
	useEffect(() => {
		if (wasEmptyRef.current && !isEmpty && document.activeElement === document.body) {
			addButtonRef.current?.focus()
		}
		wasEmptyRef.current = isEmpty
	}, [isEmpty])

	function openDialog(target: DialogTarget): void {
		setDialogTarget(target)
		setIsDialogOpen(true)
	}

	function handleSuccess(): void {
		setIsDialogOpen(false)
		toast.success(isEditing ? 'Location saved' : 'Location added')
		router.refresh()
	}

	// One element for the Empty's Add and the toolbar's: only one shows at a time, so the ref follows it.
	const addButton = (
		<Button ref={addButtonRef} className={PRESS_CLASS_NAME} onClick={() => openDialog({ mode: 'add' })}>
			<Plus aria-hidden="true" data-icon="inline-start" />
			Add location
		</Button>
	)

	function renderBody(): React.ReactNode {
		if (locations === null) return <LocationsError clientId={clientId} />
		if (isEmpty) {
			return (
				<ItemListEmpty
					icon={MapPin}
					title="No locations yet"
					description={
						isReadOnly
							? 'This client is archived.'
							: 'Add a location to assign appointments to a specific service address.'
					}
					action={isReadOnly ? undefined : addButton}
				/>
			)
		}
		return (
			<ItemListCard ariaLabel="Locations">
				{locations.map((location) => (
					<LocationItem
						key={location.id}
						location={location}
						isReadOnly={isReadOnly}
						onEdit={(target) => openDialog({ mode: 'edit', location: target })}
					/>
				))}
			</ItemListCard>
		)
	}

	return (
		<>
			<TabToolbar description="Service addresses for this client." action={canAdd ? addButton : undefined} />
			{renderBody()}
			<ResponsiveDialog
				open={isDialogOpen}
				onOpenChange={setIsDialogOpen}
				title={isEditing ? 'Edit location' : 'Add location'}
				isPending={isDialogPending}
				// After an add the opener may be the Empty's Add, gone once the list lands.
				returnFocusRef={isEditing ? undefined : addButtonRef}
			>
				<LocationForm
					key={dialogTarget.mode === 'edit' ? dialogTarget.location.id : 'new'}
					clientId={clientId}
					location={dialogTarget.mode === 'edit' ? dialogTarget.location : undefined}
					onSuccess={handleSuccess}
					onCancel={() => setIsDialogOpen(false)}
					onPendingChange={setIsDialogPending}
				/>
			</ResponsiveDialog>
		</>
	)
}
