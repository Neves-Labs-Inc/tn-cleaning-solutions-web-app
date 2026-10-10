'use client'

import { useId, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import SubmitButton from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'

import { CONNECTION_ERROR_MESSAGE, useInvoiceDetail } from './invoice-detail-context'
import { submitDraftUpdate } from './submit-draft-update'

type DraftDetailsFormProps = {
  invoiceId: string
  createdLabel: string
  businessDate: string
}

const ERROR_TITLE = "Couldn't save the draft"

// The draft's due date and notes. Its values live in the page's context, so they survive a line
// change re-rendering the page and the Issue sheet can tell they're unsaved.
export default function DraftDetailsForm({ invoiceId, createdLabel, businessDate }: DraftDetailsFormProps) {
  const { details, setDetails, showPageError } = useInvoiceDetail()
  const dueDateId = useId()
  const notesId = useId()
  const [error, setError] = useState<string | null>(null)

  // Shown above Save, and in the page slot too: a draft issued or archived elsewhere re-renders the
  // page without this form.
  function showError(message: string) {
    setError(message)
    showPageError({ title: ERROR_TITLE, message })
  }

  async function handleSubmit() {
    setError(null)
    showPageError(null)

    try {
      // Save sends no line changes: the lines already persisted as they were edited.
      const result = await submitDraftUpdate({ invoiceId, details: { ...details, notes: details.notes.trim() } })
      if (result.success) {
        toast.success('Draft saved')
        return
      }
      showError(result.error)
    } catch (thrown) {
      console.error('Save draft failed:', thrown)
      showError(CONNECTION_ERROR_MESSAGE)
    }
  }

  return (
    <Card className="gap-4 p-4 text-sm sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight">Details</h2>
      {/* noValidate: a due date saved before today must not block saving the notes. */}
      <form action={handleSubmit} noValidate className="space-y-4">
        <Field>
          <FieldLabel htmlFor={dueDateId}>
            Due date <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input
            id={dueDateId}
            type="date"
            min={businessDate}
            value={details.dueDate}
            onChange={(event) => setDetails({ ...details, dueDate: event.target.value })}
            className="hover:border-foreground/30"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={notesId}>
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea
            id={notesId}
            rows={3}
            enterKeyHint="done"
            placeholder="e.g. October deep cleans"
            value={details.notes}
            onChange={(event) => setDetails({ ...details, notes: event.target.value })}
            className="hover:border-foreground/30"
          />
        </Field>

        {error ? (
          <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{ERROR_TITLE}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <SubmitButton
          label="Save"
          pendingLabel="Saving…"
          variant="outline"
          className="w-full active:scale-[0.98] md:w-auto"
        />
      </form>
      <dl className="text-sm">
        <dt className="text-xs text-muted-foreground">Created</dt>
        <dd>{createdLabel}</dd>
      </dl>
    </Card>
  )
}
