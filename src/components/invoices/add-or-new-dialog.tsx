'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import ResponsiveDialog from '@/components/ui/responsive-dialog'
import SubmitButton from '@/components/ui/submit-button'
import { draftChoiceSubline, draftChoiceTitle, type ClientInvoiceRow } from '@/lib/invoices/client-invoices'
import { formatCents } from '@/lib/pricing/money'

import { SHEET_BUTTON_CLASS, SheetButtons } from './sheet-buttons'

export const NEW_DRAFT = 'new'

const CHOICE_CLASS_NAME =
  'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors duration-fast has-focus-visible:ring-2 has-focus-visible:ring-ring/50 has-data-checked:border-primary has-data-checked:bg-primary/5'
const ERROR_TITLE = "Couldn't add those appointments"
const UNREACHABLE_MESSAGE = "Couldn't reach the server. Try again."

type AddOrNewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  drafts: ClientInvoiceRow[]
  // "2 appointments · $180.00": what is about to be billed.
  selectionSummary: string
  // Resolves to the refusal message, or null when the draft was made or added to.
  onConfirm: (target: string) => Promise<string | null>
}

type ChoiceFormProps = Pick<AddOrNewDialogProps, 'drafts' | 'onConfirm' | 'onOpenChange'> & {
  onPendingChange: (isPending: boolean) => void
}

function ChoiceForm({ drafts, onConfirm, onOpenChange, onPendingChange }: ChoiceFormProps) {
  const [target, setTarget] = useState(NEW_DRAFT)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = target === NEW_DRAFT

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      setError(await onConfirm(target))
    } catch (thrown) {
      console.error('Add to draft failed:', thrown)
      setError(UNREACHABLE_MESSAGE)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-1">
      <RadioGroup
        value={target}
        onValueChange={(value) => setTarget(String(value))}
        disabled={isPending}
        aria-label="Where to add the appointments"
      >
        {drafts.map((draft) => (
          <label key={draft.id} className={CHOICE_CLASS_NAME}>
            <RadioGroupItem value={draft.id} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{draftChoiceTitle(draft)}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {draftChoiceSubline(draft, formatCents)}
              </span>
            </span>
          </label>
        ))}
        <label className={CHOICE_CLASS_NAME}>
          <RadioGroupItem value={NEW_DRAFT} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Start a new draft</span>
            <span className="block text-xs text-muted-foreground">Only these appointments</span>
          </span>
        </label>
      </RadioGroup>

      {error ? (
        <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{ERROR_TITLE}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SheetButtons onCancel={() => onOpenChange(false)} onPendingChange={onPendingChange} isPending={isPending}>
        <SubmitButton
          label={isNew ? 'Create draft' : 'Add to draft'}
          pendingLabel={isNew ? 'Creating draft…' : 'Adding…'}
          isPending={isPending}
          className={SHEET_BUTTON_CLASS}
        />
      </SheetButtons>
    </form>
  )
}

// Shown by Invoice when the client already has open drafts: add the ticked appointments to one, or
// start a new draft (the default). A drawer at phone width.
export default function AddOrNewDialog({ open, onOpenChange, drafts, selectionSummary, onConfirm }: AddOrNewDialogProps) {
  const [isPending, setIsPending] = useState(false)

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      isPending={isPending}
      title="Add to a draft?"
      description={`${selectionSummary}. This client already has open drafts.`}
    >
      {/* Mounted only while open, so each open starts on "Start a new draft" with no old error. */}
      <ChoiceForm drafts={drafts} onConfirm={onConfirm} onOpenChange={onOpenChange} onPendingChange={setIsPending} />
    </ResponsiveDialog>
  )
}
