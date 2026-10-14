'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { PayoutMethodInput } from '@/components/admin/payroll/payout-method-input'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateEmployee, type EmployeeActionResult } from '@/lib/actions/employees'

type EmployeeEditFormProps = {
  employee: {
    id: string
    full_name: string
    phone: string | null
    started_at: string | null
    address: string | null
    default_payout_method: string | null
    e_transfer_contact: string | null
    is_active: boolean
  }
}

const initialState: EmployeeActionResult = {
  success: false,
  error: '',
}

const PAYOUT_METHOD_HELP_ID = 'default-payout-method-help'
const PAYOUT_METHOD_ERROR_ID = 'default-payout-method-error'
const CONTACT_HELP_ID = 'e-transfer-contact-help'
const CONTACT_ERROR_ID = 'e-transfer-contact-error'

function joinIds(...ids: Array<string | false | undefined>): string | undefined {
  const present = ids.filter((id): id is string => Boolean(id))
  return present.length > 0 ? present.join(' ') : undefined
}

const inputClassName =
  'h-11 rounded-xl border-neutral-200 bg-white px-3.5 text-sm text-neutral-950 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20'

// Pending comes from the form: a hand-dispatched submit is invisible to useFormStatus.
function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
    >
      {pending ? 'Saving...' : 'Save changes'}
    </Button>
  )
}

export function EmployeeEditForm({ employee }: EmployeeEditFormProps) {
  const router = useRouter()

  async function handleSave(
    previous: EmployeeActionResult,
    formData: FormData
  ): Promise<EmployeeActionResult> {
    const result = await updateEmployee(employee.id, previous, formData)
    if (result.success) {
      toast.success('Employee saved')
      router.push(`/solutions/employees/${employee.id}`)
    }
    return result
  }

  const fullNameRef = useRef<HTMLInputElement>(null)
  const startedAtRef = useRef<HTMLInputElement>(null)
  const payoutMethodRef = useRef<HTMLInputElement>(null)
  const contactRef = useRef<HTMLInputElement>(null)
  const [state, formAction, isPending] = useActionState(handleSave, initialState)
  const fieldErrors = 'fieldErrors' in state ? state.fieldErrors : undefined

  // A refused save puts focus on the first field to fix, in form order.
  useEffect(() => {
    if (fieldErrors?.full_name) {
      fullNameRef.current?.focus()
    } else if (fieldErrors?.started_at) {
      startedAtRef.current?.focus()
    } else if (fieldErrors?.default_payout_method) {
      payoutMethodRef.current?.focus()
    } else if (fieldErrors?.e_transfer_contact) {
      contactRef.current?.focus()
    }
  }, [fieldErrors])

  // Dispatched by hand rather than through <form action>: React resets an action form's fields
  // after every submit, and a refused save must keep what the admin typed.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (isPending) return
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {'error' in state && state.error ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            role="alert"
            aria-live="polite"
          >
            {state.error}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-sm font-medium text-neutral-700">
            Full Name
          </Label>
          <Input
            ref={fullNameRef}
            id="full_name"
            name="full_name"
            type="text"
            required
            defaultValue={employee.full_name}
            aria-invalid={'fieldErrors' in state && Boolean(state.fieldErrors?.full_name)}
            aria-describedby={
              'fieldErrors' in state && state.fieldErrors?.full_name ? 'full-name-error' : undefined
            }
            className={inputClassName}
            placeholder="Alex Johnson"
          />
          {'fieldErrors' in state && state.fieldErrors?.full_name ? (
            <p id="full-name-error" className="text-xs text-red-600">
              {state.fieldErrors.full_name}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-sm font-medium text-neutral-700">
            Phone
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={employee.phone ?? ''}
            className={inputClassName}
            placeholder="(615) 555-0100"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="started_at" className="text-sm font-medium text-neutral-700">
            Started At
          </Label>
          <Input
            ref={startedAtRef}
            id="started_at"
            name="started_at"
            type="date"
            defaultValue={employee.started_at ?? ''}
            aria-invalid={'fieldErrors' in state && Boolean(state.fieldErrors?.started_at)}
            aria-describedby={
              'fieldErrors' in state && state.fieldErrors?.started_at ? 'started-at-error' : undefined
            }
            className={inputClassName}
          />
          {'fieldErrors' in state && state.fieldErrors?.started_at ? (
            <p id="started-at-error" className="text-xs text-red-600">
              {state.fieldErrors.started_at}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address" className="text-sm font-medium text-neutral-700">
            Address
          </Label>
          <Input
            id="address"
            name="address"
            type="text"
            defaultValue={employee.address ?? ''}
            className={inputClassName}
            placeholder="123 Main Street, Nashville, TN"
          />
        </div>

        <fieldset id="payout" className="scroll-mt-20 space-y-5">
          <legend className="mb-4 text-lg font-semibold tracking-tight">Payout</legend>

          <Field data-invalid={Boolean(fieldErrors?.default_payout_method)}>
            <FieldLabel htmlFor="default_payout_method">Default Payout method</FieldLabel>
            <PayoutMethodInput
              ref={payoutMethodRef}
              id="default_payout_method"
              name="default_payout_method"
              defaultValue={employee.default_payout_method ?? ''}
              error={fieldErrors?.default_payout_method}
              describedBy={joinIds(
                PAYOUT_METHOD_HELP_ID,
                Boolean(fieldErrors?.default_payout_method) && PAYOUT_METHOD_ERROR_ID
              )}
            />
            <FieldDescription id={PAYOUT_METHOD_HELP_ID}>
              Pick a suggestion or type your own. Leave blank if it varies.
            </FieldDescription>
            {fieldErrors?.default_payout_method ? (
              <FieldError id={PAYOUT_METHOD_ERROR_ID}>{fieldErrors.default_payout_method}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(fieldErrors?.e_transfer_contact)}>
            <FieldLabel htmlFor="e_transfer_contact">e-Transfer contact</FieldLabel>
            {/* Not type="email": that would refuse a phone number. */}
            <Input
              ref={contactRef}
              id="e_transfer_contact"
              name="e_transfer_contact"
              type="text"
              inputMode="email"
              autoComplete="off"
              enterKeyHint="next"
              defaultValue={employee.e_transfer_contact ?? ''}
              placeholder="ana@example.com or 647-555-0142"
              aria-invalid={Boolean(fieldErrors?.e_transfer_contact)}
              aria-describedby={joinIds(
                CONTACT_HELP_ID,
                Boolean(fieldErrors?.e_transfer_contact) && CONTACT_ERROR_ID
              )}
            />
            <FieldDescription id={CONTACT_HELP_ID}>
              Email or phone number she receives e-Transfers at.
            </FieldDescription>
            {fieldErrors?.e_transfer_contact ? (
              <FieldError id={CONTACT_ERROR_ID}>{fieldErrors.e_transfer_contact}</FieldError>
            ) : null}
          </Field>
        </fieldset>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={employee.is_active}
            className="size-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-sm text-neutral-700">Employee is active</span>
        </label>

        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-4">
          <Link
            href={`/solutions/employees/${employee.id}`}
            className="inline-flex h-10 items-center rounded-full border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Cancel
          </Link>
          <SubmitButton pending={isPending} />
        </div>
      </form>
    </section>
  )
}