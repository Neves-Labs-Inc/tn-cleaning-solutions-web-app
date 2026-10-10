import { VisitLineSummary } from '@/components/invoices/visit-line-summary'
import type { UnbilledVisitRow } from '@/lib/invoices/queries'

const STAGGER_STEP_MS = 40
const MAX_STAGGERED_ROWS = 7

type UnbilledVisitListProps = {
  visits: UnbilledVisitRow[]
}

// One client's unbilled visits. Reads the Excluded and Unpriced flags directly (not groupUnbilled's
// single tag) so a visit that is both shows both tags. The caller supplies the card around it.
export default function UnbilledVisitList({ visits }: UnbilledVisitListProps): React.ReactNode {
  return (
    <ul className="divide-y divide-border">
      {visits.map((visit, index) => (
        <li
          key={visit.id}
          className="flex min-h-14 animate-in items-center gap-3 px-4 py-3 duration-base ease-out-quart fade-in-0 slide-in-from-bottom-1 fill-mode-backwards"
          style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_ROWS) * STAGGER_STEP_MS}ms` }}
        >
          <VisitLineSummary
            date={visit.scheduled_date}
            startTime={visit.scheduled_start_time}
            endTime={visit.scheduled_end_time}
            jobName={visit.job_name}
            locationLabel={visit.location_label}
            states={visit.live_price_cents === null ? ['unpriced'] : ['ok']}
            amountCents={visit.live_price_cents ?? 0}
            appointmentId={visit.id}
            isExcluded={visit.is_excluded}
            setPriceLink="inline"
          />
        </li>
      ))}
    </ul>
  )
}
