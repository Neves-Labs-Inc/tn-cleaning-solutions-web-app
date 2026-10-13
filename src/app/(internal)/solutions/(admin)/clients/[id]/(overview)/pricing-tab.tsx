import Link from 'next/link'
import { Plus } from 'lucide-react'

import { ClientJobPricingList, type ClientJobPricingRow } from '@/components/admin/client-job-pricing-list'
import { TabLoadError } from '@/components/admin/detail-page/item-list'
import { PRESS_CLASS_NAME } from '@/components/admin/detail-page/press'
import TabToolbar from '@/components/admin/detail-page/tab-toolbar'
import { Button } from '@/components/ui/button'

// Interim body until ticket 06 replaces it: the existing rate list and a link to the new-rate page.

type PricingTabProps = {
	clientId: string
	// Null when the pricing query failed.
	rows: ClientJobPricingRow[] | null
	today: string
	isReadOnly: boolean
}

export function PricingTab({ clientId, rows, today, isReadOnly }: PricingTabProps): React.ReactNode {
	return (
		<>
			<TabToolbar
				description="Hourly rates that override a job's standard rate."
				action={
					isReadOnly ? undefined : (
						<Button
							className={PRESS_CLASS_NAME}
							render={<Link href={`/solutions/clients/${clientId}/pricing/new`} />}
							nativeButton={false}
						>
							<Plus aria-hidden="true" data-icon="inline-start" />
							Add rate
						</Button>
					)
				}
			/>
			{rows === null ? (
				<TabLoadError
					title="Couldn't load pricing"
					description="Client info is fine; this client's rates didn't load."
					retryHref={`/solutions/clients/${clientId}?tab=pricing`}
				/>
			) : (
				<ClientJobPricingList clientId={clientId} rows={rows} today={today} isReadOnly={isReadOnly} />
			)}
		</>
	)
}
