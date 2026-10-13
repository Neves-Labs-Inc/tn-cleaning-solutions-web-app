import { Card } from '@/components/ui/card'

const TERM_CLASS_NAME = 'text-xs font-semibold uppercase tracking-wider text-muted-foreground'
const DETAIL_CLASS_NAME = 'text-sm leading-6 text-foreground break-words'

type ClientInfoCardProps = {
	client: { email: string | null; phone: string | null; notes: string | null }
}

// Sits above the tabs, so it shows on every tab. No visible heading: phones need the height for the tabs.
export function ClientInfoCard({ client }: ClientInfoCardProps): React.ReactNode {
	return (
		<section aria-label="Client info">
			<Card className="p-4 sm:p-5">
				<dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
					<div className="space-y-1">
						<dt className={TERM_CLASS_NAME}>Email</dt>
						<dd className={DETAIL_CLASS_NAME}>{client.email || 'Not provided'}</dd>
					</div>
					<div className="space-y-1">
						<dt className={TERM_CLASS_NAME}>Phone</dt>
						<dd className={DETAIL_CLASS_NAME}>{client.phone || 'Not provided'}</dd>
					</div>
					<div className="space-y-1 sm:col-span-2 lg:col-span-1">
						<dt className={TERM_CLASS_NAME}>Notes</dt>
						<dd className={DETAIL_CLASS_NAME}>{client.notes || 'No notes added.'}</dd>
					</div>
				</dl>
			</Card>
		</section>
	)
}
