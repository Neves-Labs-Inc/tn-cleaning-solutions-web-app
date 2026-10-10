'use client'

import { useRouter } from 'next/navigation'
import { createContext, use, useState } from 'react'
import { toast } from 'sonner'

import type { InvoiceActionResult } from '@/lib/actions/invoices'

export type ActionError = { title: string; message: string }

export type DraftDetails = { dueDate: string; notes: string }

type PageActionCopy<T> = { errorTitle: string; success: string | ((data: T) => string) }

type InvoiceDetailContextValue = {
  // The one error slot for page-level actions (header on desktop, action bar on phones).
  pageError: ActionError | null
  // Runs a page-level action: clears the last error, toasts success, or fills the error slot.
  // Resolves to the action's data, or undefined when it failed.
  runPageAction: <T>(copy: PageActionCopy<T>, action: () => Promise<InvoiceActionResult<T>>) => Promise<T | undefined>
  // For a sheet's or form's own refusal: the action re-renders the page at its real status, which
  // can unmount the sheet holding the error, so the page slot (keyed on the invoice) keeps it too.
  showPageError: (error: ActionError | null) => void
  // The Details form's unsaved values, shared so the Issue sheet can warn about them.
  details: DraftDetails
  setDetails: (details: DraftDetails) => void
  isDetailsDirty: boolean
}

export const CONNECTION_ERROR_MESSAGE = 'Something went wrong. Check your connection and try again.'

const InvoiceDetailContext = createContext<InvoiceDetailContextValue | null>(null)

type InvoiceDetailProviderProps = {
  // The draft's saved values; a re-render after a line change brings new ones without resetting edits.
  savedDetails: DraftDetails
  children: React.ReactNode
}

// Keyed on the invoice id by the page, so unsaved edits survive re-renders of the same invoice.
export function InvoiceDetailProvider({ savedDetails, children }: InvoiceDetailProviderProps) {
  const router = useRouter()
  const [pageError, setPageError] = useState<ActionError | null>(null)
  const [details, setDetails] = useState(savedDetails)

  const isDetailsDirty = details.dueDate !== savedDetails.dueDate || details.notes.trim() !== savedDetails.notes

  async function runPageAction<T>(copy: PageActionCopy<T>, action: () => Promise<InvoiceActionResult<T>>) {
    setPageError(null)

    try {
      const result = await action()
      if (result.success) {
        toast.success(typeof copy.success === 'string' ? copy.success : copy.success(result.data))
        return result.data
      }

      setPageError({ title: copy.errorTitle, message: result.error })
      // A refusal usually means this page is stale, so re-read it.
      router.refresh()
    } catch (thrown) {
      console.error('Invoice action failed:', thrown)
      setPageError({ title: copy.errorTitle, message: CONNECTION_ERROR_MESSAGE })
    }
    return undefined
  }

  return (
    <InvoiceDetailContext value={{ pageError, runPageAction, showPageError: setPageError, details, setDetails, isDetailsDirty }}>
      {children}
    </InvoiceDetailContext>
  )
}

export function useInvoiceDetail(): InvoiceDetailContextValue {
  const value = use(InvoiceDetailContext)
  if (!value) throw new Error('useInvoiceDetail must be used inside InvoiceDetailProvider')
  return value
}
