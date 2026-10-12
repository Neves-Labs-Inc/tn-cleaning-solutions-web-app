'use client'

import { useEffect, useId, useRef } from 'react'
import { AlertCircle, Pencil } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

import { useLineTotalEdit } from './use-line-total-edit'
import { formatVisitDate } from './visit-line-summary'

type LineTotalEditorProps = {
  invoiceId: string
  appointmentId: string
  jobName: string
  date: string
  // null is an Unpriced line: the input starts blank.
  amountCents: number | null
  isOverridden: boolean
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  // Another line is saving or being removed.
  isBusy: boolean
  onPendingChange: (isPending: boolean) => void
}

const TRIGGER_CLASS =
  'inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none transition-opacity duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 active:opacity-70 enabled:md:hover:underline disabled:cursor-default disabled:opacity-50'
const ERROR_TITLE = "Couldn't update the total"

type EditorFormProps = Omit<LineTotalEditorProps, 'jobName' | 'date' | 'isOpen' | 'onOpenChange'> & { onClose: () => void }

type PendingLabelProps = { isPending: boolean; idle: string; pending: string }

// Both labels share one grid cell, so the button keeps the wider of the two widths.
function PendingLabel({ isPending, idle, pending }: PendingLabelProps) {
  return (
    <span className="grid *:col-start-1 *:row-start-1">
      <span className={cn(isPending && 'invisible')}>{idle}</span>
      {isPending ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <Spinner aria-hidden="true" />
          {pending}
        </span>
      ) : null}
    </span>
  )
}

function EditorForm({ invoiceId, appointmentId, amountCents, isOverridden, isBusy, onClose, onPendingChange }: EditorFormProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = `line-total-${appointmentId}`
  const errorId = useId()
  const { value, changeValue, fieldError, formError, pendingAction, save, clear } = useLineTotalEdit({
    invoiceId,
    appointmentId,
    amountCents,
    onClose,
    onPendingChange,
  })
  const isPending = pendingAction !== null

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // A failure keeps the typed value and puts focus back in the input.
  useEffect(() => {
    if (formError) inputRef.current?.focus()
  }, [formError])

  // Clicking Save leaves focus on the button, so a validation error pulls it back to the input.
  useEffect(() => {
    if (fieldError) inputRef.current?.focus()
  }, [fieldError])

  return (
    <form
      noValidate
      aria-label="Edit total"
      onSubmit={(event) => {
        event.preventDefault()
        if (isBusy) return
        void save()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isPending) onClose()
      }}
      className="mt-2 flex animate-in flex-col gap-2 duration-base ease-out-quart fade-in-0 slide-in-from-top-1 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <Field data-invalid={fieldError ? true : undefined} className="w-full sm:w-40">
        <FieldLabel htmlFor={inputId} className="text-sm font-medium">
          Total ($)
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>$</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            id={inputId}
            name="amount"
            value={value}
            onChange={(event) => changeValue(event.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            disabled={isPending}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            className="text-right tabular-nums"
          />
        </InputGroup>
        {fieldError ? <FieldError id={errorId}>{fieldError}</FieldError> : null}
      </Field>

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={isPending || isBusy}
          aria-busy={pendingAction === 'save' || undefined}
          className="flex-1 sm:flex-none"
        >
          <PendingLabel isPending={pendingAction === 'save'} idle="Save" pending="Saving…" />
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onClose} className="flex-1 sm:flex-none">
          Cancel
        </Button>
      </div>

      {isOverridden ? (
        <Button
          type="button"
          variant="ghost"
          disabled={isPending || isBusy}
          aria-busy={pendingAction === 'clear' || undefined}
          onClick={() => void clear()}
          className="self-start text-primary sm:ml-auto sm:self-end"
        >
          <PendingLabel isPending={pendingAction === 'clear'} idle="Use calculated price" pending="Clearing…" />
        </Button>
      ) : null}

      {formError ? (
        <Alert variant="destructive" className="animate-in duration-base ease-out-quart fade-in-0 slide-in-from-top-1 sm:basis-full">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{ERROR_TITLE}</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  )
}

// A draft line's "Edit total" trigger, and the inline editor it opens.
export default function LineTotalEditor({
  jobName,
  date,
  amountCents,
  isOpen,
  onOpenChange,
  isBusy,
  ...formProps
}: LineTotalEditorProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const shouldRestoreFocusRef = useRef(false)
  const label = amountCents === null ? 'Set price' : 'Edit total'

  // The trigger remounts after the editor closes, so focus returns once it is back.
  useEffect(() => {
    if (!isOpen && shouldRestoreFocusRef.current) {
      shouldRestoreFocusRef.current = false
      triggerRef.current?.focus()
    }
  }, [isOpen])

  function handleClose() {
    shouldRestoreFocusRef.current = true
    onOpenChange(false)
  }

  if (isOpen) {
    return <EditorForm amountCents={amountCents} isBusy={isBusy} {...formProps} onClose={handleClose} />
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      disabled={isBusy}
      aria-expanded={false}
      aria-label={`${label} for ${jobName} on ${formatVisitDate(date)}`}
      onClick={() => onOpenChange(true)}
      className={cn(TRIGGER_CLASS, 'animate-in duration-fast fade-in-0')}
    >
      <Pencil className="size-4" aria-hidden="true" />
      {label}
    </button>
  )
}
