'use client'

import { unstable_rethrow } from 'next/navigation'
import { startTransition, useActionState, useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'

import { SheetButtons, SHEET_BUTTON_CLASS } from '@/components/invoices/sheet-buttons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import SubmitButton from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { addLocation, type LocationActionResult, updateLocation } from '@/lib/actions/clients'

type LocationFormProps = {
  clientId: string
  location?: {
    id: string
    label: string
    address: string
    notes: string | null
  }
  // The form sits in a ResponsiveDialog, which owns closing, the toast and the refresh.
  onSuccess: () => void
  onCancel: () => void
  onPendingChange: (isPending: boolean) => void
}

const initialState: LocationActionResult = {
  success: false,
  error: '',
}

const SAVE_FAILED_MESSAGE = "Couldn't save the location. Try again."
const LABEL_ERROR_ID = 'location-label-error'
const ADDRESS_ERROR_ID = 'location-address-error'

export function LocationForm({ clientId, location, onSuccess, onCancel, onPendingChange }: LocationFormProps) {
  const serverAction = location ? updateLocation.bind(null, location.id) : addLocation.bind(null, clientId)
  const labelRef = useRef<HTMLInputElement>(null)
  const addressRef = useRef<HTMLInputElement>(null)

  async function handleSave(previous: LocationActionResult, formData: FormData): Promise<LocationActionResult> {
    let result: LocationActionResult
    try {
      result = await serverAction(previous, formData)
    } catch (error) {
      unstable_rethrow(error)
      console.error('Location save failed', location?.id ?? clientId, error)
      result = { success: false, error: SAVE_FAILED_MESSAGE }
    }

    if (result.success) {
      onSuccess()
    }
    return result
  }

  const [state, formAction, isPending] = useActionState(handleSave, initialState)
  // Errors hide while a retry is in flight: the state still holds the last refusal until the new answer lands.
  const isRefusedOnFields = 'fieldErrors' in state && Boolean(state.fieldErrors)
  const fieldErrors = !isPending && 'fieldErrors' in state ? state.fieldErrors : undefined
  const formError = !isPending && !state.success && !isRefusedOnFields ? state.error : ''

  // A refused save puts focus on the first field to fix.
  useEffect(() => {
    if (fieldErrors?.label) {
      labelRef.current?.focus()
    } else if (fieldErrors?.address) {
      addressRef.current?.focus()
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <Field data-invalid={Boolean(fieldErrors?.label)}>
        <FieldLabel htmlFor="location-label">Label</FieldLabel>
        <Input
          ref={labelRef}
          id="location-label"
          name="label"
          type="text"
          autoComplete="off"
          enterKeyHint="next"
          defaultValue={location?.label ?? 'Location'}
          aria-invalid={Boolean(fieldErrors?.label)}
          aria-describedby={fieldErrors?.label ? LABEL_ERROR_ID : undefined}
          placeholder="e.g. Main Home, Lake House"
        />
        {fieldErrors?.label ? <FieldError id={LABEL_ERROR_ID}>{fieldErrors.label}</FieldError> : null}
      </Field>

      <Field data-invalid={Boolean(fieldErrors?.address)}>
        <FieldLabel htmlFor="location-address">Address</FieldLabel>
        <Input
          ref={addressRef}
          id="location-address"
          name="address"
          type="text"
          required
          autoComplete="street-address"
          enterKeyHint="next"
          defaultValue={location?.address ?? ''}
          aria-invalid={Boolean(fieldErrors?.address)}
          aria-describedby={fieldErrors?.address ? ADDRESS_ERROR_ID : undefined}
          placeholder="123 Queen St W, Toronto, ON"
        />
        {fieldErrors?.address ? <FieldError id={ADDRESS_ERROR_ID}>{fieldErrors.address}</FieldError> : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="location-notes">Notes</FieldLabel>
        <Textarea
          id="location-notes"
          name="notes"
          defaultValue={location?.notes ?? ''}
          className="min-h-28"
          placeholder="Parking details, gate code, alarm instructions, etc."
        />
      </Field>

      {formError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <SheetButtons onCancel={onCancel} onPendingChange={onPendingChange} isPending={isPending}>
        <SubmitButton
          className={SHEET_BUTTON_CLASS}
          label={location ? 'Save changes' : 'Add location'}
          pendingLabel={location ? 'Saving…' : 'Adding…'}
          isPending={isPending}
        />
      </SheetButtons>
    </form>
  )
}
