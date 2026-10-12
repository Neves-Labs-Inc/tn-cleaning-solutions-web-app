import { CheckCircle2, CircleDashed, ClockAlert, ReceiptText, type LucideIcon } from 'lucide-react'

import LinkPendingIcon from '@/components/ui/link-pending-icon'
import StatTile from '@/components/ui/stat-tile'
import {
  appointmentsHref,
  tileCaption,
  toggleView,
  type AppointmentsQuery,
  type AppointmentsView,
  type Overview,
  type TileTotal,
} from '@/lib/appointments/overview'
import { formatCents } from '@/lib/pricing/money'

type AppointmentsOverviewTilesProps = {
  overview: Overview
  query: AppointmentsQuery
}

type TileSpec = {
  view: AppointmentsView
  label: string
  total: TileTotal
  caption: string
  icon: LucideIcon
}

// The four overview tiles, in workflow order: complete, bill, get paid. Each is a Link to its view (or back to the schedule when its view is
// showing), so Back, new tabs and shared links keep the choice.
export default function AppointmentsOverviewTiles({
  overview,
  query,
}: AppointmentsOverviewTilesProps): React.ReactNode {
  const tiles: TileSpec[] = [
    {
      view: 'needs-completion',
      label: 'Needs completion',
      total: overview.needsCompletion,
      caption: tileCaption(overview.needsCompletion.count, 'all months', overview.needsCompletion.unpricedCount),
      icon: ClockAlert,
    },
    {
      view: 'needs-billing',
      label: 'Needs billing',
      total: overview.needsBilling,
      caption: tileCaption(overview.needsBilling.count, 'all months', overview.needsBilling.unpricedCount),
      icon: CircleDashed,
    },
    {
      view: 'billed',
      label: 'Billed',
      total: overview.billed,
      caption: tileCaption(overview.billed.count, 'this month'),
      icon: ReceiptText,
    },
    {
      view: 'paid',
      label: 'Paid',
      total: overview.paid,
      caption: tileCaption(overview.paid.count, 'this month'),
      icon: CheckCircle2,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map(({ view, label, total, caption, icon: Icon }) => (
        <StatTile
          key={view}
          label={label}
          value={formatCents(total.totalCents)}
          caption={caption}
          icon={<LinkPendingIcon icon={<Icon aria-hidden="true" className="size-5" />} />}
          href={appointmentsHref(toggleView(query, view))}
          isActive={query.view === view}
          fitValue
        />
      ))}
    </div>
  )
}
