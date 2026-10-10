'use client'

import Link from 'next/link'
import { useId, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import SubmitButton from '@/components/ui/submit-button'
import { recordPayment, updatePayment } from '@/lib/actions/invoices'
import type { PaymentMethod } from '@/lib/invoices/ledger'
import { findDuplicateMethod, normalizePaymentMethodName } from '@/lib/invoices/view'
import { CONNECTION_ERROR_MESSAGE, useInvoiceDetail } from './invoice-detail-context'
import { SHEET_BUTTON_CLASS, SheetButtons } from './sheet-buttons'

export type PaymentValues = { paidDate: string; method: string; reference: string }

type PaymentFormProps = {
  mode: 'record' | 'edit'
  invoiceId: string
  // Every method, hidden ones included: a hidden method can still be the one an invoice was paid with.
  methods: PaymentMethod[]
  // The stored payment when editing.
  initial: PaymentValues | null
  businessDate: string
  onCancel: () => void
  onSuccess: () => void
  onPendingChange: (isPending: boolean) => void
}

type FieldName = 'paidDate' | 'method'

// The "Other…" option's value. A stored method with this exact name would be shadowed; none is expected.
const OTHER = '__other__'
const MANAGE_METHODS_PATH = '/solutions/invoices/payment-methods'

const FIELD_CODES: Record<string, FieldName> = {
  paid_date_future: 'paidDate',
  method_required: 'method',
}

const COPY = {
  record: {
    errorTitle: "Couldn't record the payment",
    success: 'Payment recorded',
    submit: 'Record payment',
    pending: 'Recording…',
  },
  edit: {
    errorTitle: "Couldn't update the payment",
    success: 'Payment updated',
    submit: 'Save payment',
    pending: 'Saving…',
  },
}

// The picker lists the visible methods in sort_order. When editing, a stored method that is now
// hidden or renamed leads the list, so saving the edit doesn't change it.
function methodOptions(visible: PaymentMethod[], initialMethod: string | null): string[] {
  const names = visible.map((method) => method.name)
  const isStoredMissing = initialMethod !== null && initialMethod !== '' && !names.includes(initialMethod)
  return isStoredMissing ? [initialMethod, ...names] : names
}

export default function PaymentForm({
  mode,
  invoiceId,
  methods,
  initial,
  businessDate,
  onCancel,
  onSuccess,
  onPendingChange,
}: PaymentFormProps) {
  const copy = COPY[mode]
  const { showPageError } = useInvoiceDetail()
  const ids = {
    paidDate: useId(),
    method: useId(),
    other: useId(),
    reference: useId(),
    paidDateError: useId(),
    methodError: useId(),
  }
  const otherRef = useRef<HTMLInputElement>(null)

  const visible = methods.filter((method) => !method.is_hidden)
  const options = methodOptions(visible, initial?.method ?? null)

  const [paidDate, setPaidDate] = useState(initial?.paidDate ?? businessDate)
  // An edit keeps the stored method; a payment saved without one starts on a placeholder rather
  // than silently taking the first method.
  const [choice, setChoice] = useState(initial ? initial.method : options[0] || OTHER)
  const [otherName, setOtherName] = useState('')
  const [reference, setReference] = useState(initial?.reference ?? '')
  const [fieldError, setFieldError] = useState<{ field: FieldName; message: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const isOther = choice === OTHER
  const method = isOther ? normalizePaymentMethodName(otherName) : choice
  const duplicate = isOther && method ? findDuplicateMethod(method, visible, '') : null
  // SQL reuses a hidden method typed by name, and it stays hidden.
  const hiddenMatch = isOther && method && !duplicate ? findDuplicateMethod(method, methods, '') : null
  const paidDateError = fieldError?.field === 'paidDate' ? fieldError.message : null
  const methodError = fieldError?.field === 'method' ? fieldError.message : null

  function focusField(field: FieldName) {
    const id = field === 'paidDate' ? ids.paidDate : isOther ? ids.other : ids.method
    document.getElementById(id)?.focus()
  }

  function handleChoiceChange(next: string) {
    setChoice(next)
    if (next === OTHER) {
      // After the field mounts; autoFocus would also fire when "Other…" is the only option.
      requestAnimationFrame(() => otherRef.current?.focus())
    }
  }

  // Shown in the sheet, and in the page slot too: a refusal re-renders the page at its real status,
  // which can unmount this sheet (another tab paid or voided the invoice).
  function showFormError(message: string) {
    setFormError(message)
    showPageError({ title: copy.errorTitle, message })
  }

  async function handleSubmit(formData: FormData) {
    setFieldError(null)
    setFormError(null)
    showPageError(null)

    try {
      const action = mode === 'record' ? recordPayment : updatePayment
      const result = await action(null, formData)
      if (result.success) {
        toast.success(copy.success)
        onSuccess()
        return
      }

      const field = FIELD_CODES[result.code]
      if (field) {
        setFieldError({ field, message: result.error })
        focusField(field)
      } else {
        showFormError(result.error)
      }
    } catch (thrown) {
      console.error('Payment action failed:', thrown)
      showFormError(CONNECTION_ERROR_MESSAGE)
    }
  }

  return (
    // noValidate: the paid-date rule is the server's, and its message shows under the field.
    <form action={handleSubmit} noValidate className="space-y-5">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="payment_method" value={method} />

      <Field data-invalid={paidDateError ? true : undefined}>
        <FieldLabel htmlFor={ids.paidDate}>Paid on</FieldLabel>
        <Input
          id={ids.paidDate}
          name="paid_date"
          type="date"
          max={businessDate}
          value={paidDate}
          onChange={(event) => setPaidDate(event.target.value)}
          aria-invalid={paidDateError ? true : undefined}
          aria-describedby={paidDateError ? ids.paidDateError : undefined}
          className="hover:border-foreground/30"
        />
        {paidDateError ? <FieldError id={ids.paidDateError}>{paidDateError}</FieldError> : null}
      </Field>

      <Field data-invalid={methodError && !isOther ? true : undefined}>
        <FieldLabel htmlFor={ids.method}>Method</FieldLabel>
        <NativeSelect
          id={ids.method}
          value={choice}
          onChange={(event) => handleChoiceChange(event.target.value)}
          className="w-full"
          aria-invalid={methodError && !isOther ? true : undefined}
          aria-describedby={methodError && !isOther ? ids.methodError : undefined}
        >
          {choice === '' ? (
            <NativeSelectOption value="" disabled>
              Choose a method
            </NativeSelectOption>
          ) : null}
          {options.map((name) => (
            <NativeSelectOption key={name} value={name}>
              {name}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={OTHER}>Other…</NativeSelectOption>
        </NativeSelect>
        {methodError && !isOther ? <FieldError id={ids.methodError}>{methodError}</FieldError> : null}
        <Link
          href={MANAGE_METHODS_PATH}
          className="inline-flex min-h-11 w-fit! cursor-pointer self-start items-center rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none transition-opacity duration-fast focus-visible:ring-2 focus-visible:ring-ring/50 active:opacity-70 md:min-h-0 md:hover:underline"
        >
          Manage methods
        </Link>
      </Field>

      {isOther ? (
        <Field
          data-invalid={methodError ? true : undefined}
          className="animate-in fade-in-0 slide-in-from-top-1 duration-base"
        >
          <FieldLabel htmlFor={ids.other}>Method name</FieldLabel>
          <Input
            ref={otherRef}
            id={ids.other}
            value={otherName}
            onChange={(event) => setOtherName(event.target.value)}
            autoComplete="off"
            enterKeyHint="next"
            placeholder="e.g. Cash"
            aria-invalid={methodError ? true : undefined}
            aria-describedby={methodError ? ids.methodError : undefined}
            className="hover:border-foreground/30"
          />
          {methodError ? <FieldError id={ids.methodError}>{methodError}</FieldError> : null}
          {duplicate ? (
            <FieldDescription className="flex flex-wrap items-center gap-x-1">
              {duplicate.name} is already in the list.
              <Button
                type="button"
                variant="link"
                className="h-auto min-h-11 px-0 md:min-h-0"
                onClick={() => setChoice(duplicate.name)}
              >
                Use {duplicate.name}
              </Button>
            </FieldDescription>
          ) : hiddenMatch ? (
            <FieldDescription>
              {hiddenMatch.name} is a hidden method. The payment is recorded under it and it stays hidden.
            </FieldDescription>
          ) : (
            <FieldDescription>It&apos;s added to the list for next time.</FieldDescription>
          )}
        </Field>
      ) : null}

      <Field>
        <FieldLabel htmlFor={ids.reference}>
          Reference <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input
          id={ids.reference}
          name="payment_reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="e-Transfer confirmation or cheque number"
          autoComplete="off"
          enterKeyHint="done"
          className="hover:border-foreground/30"
        />
      </Field>

      {formError ? (
        <Alert
          variant="destructive"
          className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart"
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{copy.errorTitle}</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <SheetButtons onCancel={onCancel} onPendingChange={onPendingChange}>
        <SubmitButton label={copy.submit} pendingLabel={copy.pending} className={SHEET_BUTTON_CLASS} />
      </SheetButtons>
    </form>
  )
}
