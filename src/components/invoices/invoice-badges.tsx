import StatusBadge from '@/components/ui/status-badge'
import { invoiceFlagBadges } from '@/components/ui/status-badge-tones'
import type { InvoiceEffectiveStatus } from '@/lib/invoices/view'

type InvoiceBadgesProps = {
  row: {
    effective_status: InvoiceEffectiveStatus
    is_automatic: boolean
    is_archived: boolean
    has_unpriced?: boolean
  }
  // 'tags' is Automatic and Archived (beside the number), 'status' the rest (status and Unpriced).
  part?: 'all' | 'tags' | 'status'
  className?: string
}

const TAG_LABELS = ['Automatic', 'Archived']

// Renders a fragment of pills: the caller supplies the flex wrapper.
export default function InvoiceBadges({ row, part = 'all', className }: InvoiceBadgesProps): React.ReactNode {
  const badges = invoiceFlagBadges(row).filter((badge) => {
    const isTag = TAG_LABELS.includes(badge.label)
    return part === 'all' || (part === 'tags') === isTag
  })

  return badges.map((badge) => (
    <StatusBadge key={badge.label} tone={badge.tone} icon={badge.icon} className={className}>
      {badge.label}
    </StatusBadge>
  ))
}
