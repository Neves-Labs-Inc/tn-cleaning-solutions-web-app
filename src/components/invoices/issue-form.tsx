'use client'

import { useId, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import SubmitButton from '@/components/ui/submit-button'
import { issueInvoice } from '@/lib/actions/invoices'
import { formatCents } from '@/lib/pricing/money'

import { CONNECTION_ERROR_MESSAGE, useInvoiceDetail } from './invoice-detail-context'
import { SHEET_BUTTON_CLASS, SheetButtons } from './sheet-buttons'

type IssueFormProps = {
  invoiceId: string
  // The draft's saved due date ('' when none); the sheet starts from it.
  savedDueDate: string
  lineCount: number
  totalCents: number
  businessDate: string
  onCancel: () => void
  onSuccess: () => void
  onPendingChange: (isPending: boolean) => void
}

const ERROR_TITLE = "Couldn't issue this draft"

export default function IssueForm({
  invoiceId,
  savedDueDate,
  lineCount,
  totalCents,
  businessDate,
  onCancel,
  onSuccess,
  onPendingChange,
}: IssueFormProps) {
  const { isDetailsDirty, showPageError } = useInvoiceDetail()
  const dueDateId = useId()
  const hintId = useId()
  const errorId = useId()
  const [dueDate, setDueDate] = useState(savedDueDate)
  const [dueDateError, setDueDateError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Shown in the sheet, and in the page slot too: a refusal re-renders the page at its real status,
  // which can unmount this sheet (another tab issued the draft).
  function showFormError(message: string) {
    setFormError(message)
    showPageError({ title: ERROR_TITLE, message })
  }

  async function handleSubmit(formData: FormData) {
    setDueDateError(null)
    setFormError(null)
    showPageError(null)

    try {
      const result = await issueInvoice(null, formData)
      if (result.success) {
        toast.success(`Issued ${result.data.invoiceNumber}`)
        onSuccess()
        return
      }

      if (result.code === 'due_before_issue') {
        setDueDateError(result.error)
        document.getElementById(dueDateId)?.focus()
      } else {
        showFormError(result.error)
      }
    } catch (thrown) {
      console.error('Issue failed:', thrown)
      showFormError(CONNECTION_ERROR_MESSAGE)
    }
  }

  return (
    // noValidate: the due-date rule is the server's, and its message shows under the field.
    <form action={handleSubmit} noValidate className="space-y-5">
      <input type="hidden" name="invoice_id" value={invoiceId} />

      <p className="text-sm font-medium tabular-nums">
        {lineCount} {lineCount === 1 ? 'visit' : 'visits'} · {formatCents(totalCents)}
      </p>

      <Field data-invalid={dueDateError ? true : undefined}>
        <FieldLabel htmlFor={dueDateId}>
          Due date <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input
          id={dueDateId}
          name="due_date"
          type="date"
          min={businessDate}
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-invalid={dueDateError ? true : undefined}
          aria-describedby={dueDateError ? `${errorId} ${hintId}` : hintId}
          className="hover:border-foreground/30"
        />
        {dueDateError ? <FieldError id={errorId}>{dueDateError}</FieldError> : null}
        <FieldDescription id={hintId}>Leave blank and it&apos;s owed but never overdue.</FieldDescription>
      </Field>

      {isDetailsDirty ? (
        <p className="text-sm text-muted-foreground">
          You have unsaved changes to the due date or notes. Save them first or they won&apos;t be on the invoice.
        </p>
      ) : null}

      {formError ? (
        <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{ERROR_TITLE}</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <SheetButtons onCancel={onCancel} onPendingChange={onPendingChange}>
        <SubmitButton label="Issue invoice" pendingLabel="Issuing…" className={SHEET_BUTTON_CLASS} />
      </SheetButtons>
    </form>
  )
}
