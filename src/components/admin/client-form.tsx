'use client'

import Link from 'next/link'
import { unstable_rethrow } from 'next/navigation'
import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'

import { SheetButtons, SHEET_BUTTON_CLASS } from '@/components/invoices/sheet-buttons'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import SubmitButton from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { useAppointmentsCache } from '@/hooks/use-appointments-cache'
import { createClient, type ClientActionResult, updateClient } from '@/lib/actions/clients'
import { appointmentsKeys } from '@/lib/appointments/appointments-keys'

type ClientFormProps = {
  client?: {
    id: string
    name: string
    email: string | null
    phone: string | null
    notes: string | null
    is_active: boolean
  }
  // Dialog mode: the form sits in a ResponsiveDialog, and these replace the page's redirect and Cancel link.
  dialog?: {
    onSuccess: () => void
    onCancel: () => void
    onPendingChange: (isPending: boolean) => void
  }
}

const initialState: ClientActionResult = {
  success: false,
  error: '',
}

const SAVE_FAILED_MESSAGE = "Couldn't save the client. Try again."
const NAME_ERROR_ID = 'client-name-error'
const EMAIL_ERROR_ID = 'client-email-error'

export function ClientForm({ client, dialog }: ClientFormProps) {
  const appointmentsCache = useAppointmentsCache()
  const saveAction = client ? updateClient.bind(null, client.id) : createClient
  const [isActive, setIsActive] = useState(client?.is_active ?? true)
  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Patch the cache before the action runs so rows show the new name at once; a refused or failed
  // save undoes the rename, so rows never show a name that wasn't saved. Create redirects on success,
  // so the code after its await only runs when the save is refused.
  async function handleSave(previous: ClientActionResult, formData: FormData): Promise<ClientActionResult> {
    const name = String(formData.get('name') ?? '').trim()
    const isRenamed = client !== undefined && name !== client.name

    if (isRenamed) {
      appointmentsCache.rename({ kind: 'client', id: client.id, name })
    }

    // Create's success is a redirect, so nothing after the await runs for it: refresh the filter first.
    if (client === undefined) {
      void appointmentsCache.refresh([appointmentsKeys.filterOptions])
    }

    let result: ClientActionResult
    try {
      result = await saveAction(previous, formData)
    } catch (error) {
      // A redirect is create's success path and rethrows here; any other throw means nothing was saved.
      unstable_rethrow(error)
      console.error('Client save failed', client?.id, error)
      result = { success: false, error: SAVE_FAILED_MESSAGE }
    }

    if (result.success) {
      // After the rename: setQueryData clears the stale mark, so refresh last.
      void appointmentsCache.refresh([appointmentsKeys.filterOptions])
      dialog?.onSuccess()
    } else if (isRenamed) {
      appointmentsCache.rename({ kind: 'client', id: client.id, name: client.name })
    }
    return result
  }

  const [state, formAction, isPending] = useActionState(handleSave, initialState)
  const fieldErrors = 'fieldErrors' in state ? state.fieldErrors : undefined
  const formError = !state.success && !fieldErrors ? state.error : ''

  // A refused save puts focus on the first field to fix.
  useEffect(() => {
    if (fieldErrors?.name) {
      nameRef.current?.focus()
    } else if (fieldErrors?.email) {
      emailRef.current?.focus()
    }
  }, [fieldErrors])

  // Dispatched by hand rather than through <form action>: React resets an action form's fields after
  // every submit, and a refused save must keep what the admin typed.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  const form = (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Field data-invalid={Boolean(fieldErrors?.name)}>
        <FieldLabel htmlFor="client-name">Name</FieldLabel>
        <Input
          ref={nameRef}
          id="client-name"
          name="name"
          type="text"
          required
          autoComplete="off"
          defaultValue={client?.name ?? ''}
          aria-invalid={Boolean(fieldErrors?.name)}
          aria-describedby={fieldErrors?.name ? NAME_ERROR_ID : undefined}
          placeholder="Johnson Family"
        />
        {fieldErrors?.name ? <FieldError id={NAME_ERROR_ID}>{fieldErrors.name}</FieldError> : null}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        <Field data-invalid={Boolean(fieldErrors?.email)}>
          <FieldLabel htmlFor="client-email">Email</FieldLabel>
          <Input
            ref={emailRef}
            id="client-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="next"
            defaultValue={client?.email ?? ''}
            aria-invalid={Boolean(fieldErrors?.email)}
            aria-describedby={fieldErrors?.email ? EMAIL_ERROR_ID : undefined}
            placeholder="client@example.com"
          />
          {fieldErrors?.email ? <FieldError id={EMAIL_ERROR_ID}>{fieldErrors.email}</FieldError> : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="client-phone">Phone</FieldLabel>
          <Input
            id="client-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={client?.phone ?? ''}
            placeholder="(416) 555-0100"
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="client-notes">Notes</FieldLabel>
        <Textarea
          id="client-notes"
          name="notes"
          defaultValue={client?.notes ?? ''}
          placeholder="Preferred arrival windows, gate codes, pets, or special instructions."
        />
      </Field>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground">
        <Checkbox checked={isActive} onCheckedChange={setIsActive} />
        Client is active
      </label>
      {/* The checkbox has no name: the action reads is_active === 'on', so post exactly that. */}
      {isActive ? <input type="hidden" name="is_active" value="on" /> : null}

      {formError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {dialog ? (
        <SheetButtons onCancel={dialog.onCancel} onPendingChange={dialog.onPendingChange} isPending={isPending}>
          <SubmitButton
            className={SHEET_BUTTON_CLASS}
            label="Save changes"
            pendingLabel="Saving…"
            isPending={isPending}
          />
        </SheetButtons>
      ) : (
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className={cn(SHEET_BUTTON_CLASS, 'active:bg-muted')}
            render={<Link href="/solutions/clients" />}
            nativeButton={false}
          >
            Cancel
          </Button>
          <SubmitButton
            className={SHEET_BUTTON_CLASS}
            label="Create client"
            pendingLabel="Saving…"
            isPending={isPending}
          />
        </div>
      )}
    </form>
  )

  return dialog ? form : <Card className="p-4 sm:p-6">{form}</Card>
}
