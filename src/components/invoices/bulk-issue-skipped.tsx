import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { BulkIssueSkips } from '@/hooks/use-bulk-issue'

type BulkIssueSkippedProps = {
  skips: BulkIssueSkips
  onDismiss: () => void
}

function titleFor({ issuedCount, drafts }: BulkIssueSkips): string {
  if (issuedCount === 0) return 'Nothing was issued'
  return drafts.length === 1 ? "1 draft wasn't issued" : `${drafts.length} drafts weren't issued`
}

export default function BulkIssueSkipped({ skips, onDismiss }: BulkIssueSkippedProps): React.ReactNode {
  return (
    <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>{titleFor(skips)}</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {skips.drafts.map((draft) => (
            <li key={draft.id}>
              <Link
                href={`/solutions/invoices/${draft.id}`}
                className="font-medium underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {draft.clientName}
              </Link>
              {` · Draft — ${draft.message}`}
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" className="mt-2 -ml-3" onClick={onDismiss}>
          Dismiss
        </Button>
      </AlertDescription>
    </Alert>
  )
}
