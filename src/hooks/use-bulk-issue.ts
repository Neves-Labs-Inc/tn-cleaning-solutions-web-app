import { useOptimistic, useState } from 'react'
import { toast } from 'sonner'

import { bulkIssueInvoices } from '@/lib/actions/invoices'
import type { LedgerListRow } from '@/lib/invoices/view'

export type SkippedDraft = { id: string; clientName: string; message: string }

export type BulkIssueSkips = { issuedCount: number; drafts: SkippedDraft[] }

export type BulkIssue = {
  dueDate: string
  changeDueDate: (value: string) => void
  error: string | null
  isDueDateInvalid: boolean
  isPending: boolean
  skips: BulkIssueSkips | null
  dismissSkips: () => void
  resetError: () => void
  issue: (invoiceIds: string[]) => Promise<void>
}

function pluralInvoices(count: number): string {
  return count === 1 ? 'invoice' : 'invoices'
}

// Runs the bulk-issue action and holds what the bar and the list show about it. `onDone` runs after
// the ledger answered (issued or skipped), not after a failed call, so a retry keeps its selection.
export function useBulkIssue(rows: LedgerListRow[], onDone: () => void): BulkIssue {
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  // Optimistic, not useState: the form action runs in a transition, which holds plain state updates
  // back until it finishes, so the controls would never disable while the call is in flight.
  const [isPending, setOptimisticPending] = useOptimistic(false)
  const [skips, setSkips] = useState<BulkIssueSkips | null>(null)

  function changeDueDate(value: string): void {
    setDueDate(value)
    setError(null)
    setErrorCode(null)
  }

  async function issue(invoiceIds: string[]): Promise<void> {
    const formData = new FormData()
    for (const id of invoiceIds) {
      formData.append('invoice_ids', id)
    }
    formData.set('due_date', dueDate)

    setOptimisticPending(true)
    setError(null)
    setErrorCode(null)
    try {
      const result = await bulkIssueInvoices(null, formData)
      if (!result.success) {
        setError(result.error)
        setErrorCode(result.code)
        return
      }

      const { issued, skipped } = result.data
      if (issued.length > 0) {
        toast.success(`Issued ${issued.length} ${pluralInvoices(issued.length)}`)
      }
      const namesById = new Map(rows.map((row) => [row.id, row.client_name]))
      setSkips(
        skipped.length === 0
          ? null
          : {
              issuedCount: issued.length,
              drafts: skipped.map((draft) => ({
                id: draft.id,
                clientName: namesById.get(draft.id) ?? 'Unknown client',
                message: draft.message,
              })),
            },
      )
      onDone()
    } catch {
      // The action itself threw (network drop): treat it like a failed call so the bar can retry.
      setError('Something went wrong. Try again.')
    }
  }

  return {
    dueDate,
    changeDueDate,
    error,
    isDueDateInvalid: errorCode === 'due_before_issue',
    isPending,
    skips,
    dismissSkips: () => setSkips(null),
    resetError: () => {
      setError(null)
      setErrorCode(null)
    },
    issue,
  }
}
