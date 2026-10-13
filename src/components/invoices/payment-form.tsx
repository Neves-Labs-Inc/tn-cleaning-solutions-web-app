'use client'

import { useId, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import SubmitButton from '@/components/ui/submit-button'
import { useAppointmentsCache } from '@/hooks/use-appointments-cache'
import { recordPayment, updatePayment } from '@/lib/actions/invoices'
import type { PaymentMethod } from '@/lib/invoices/ledger'
import { CONNECTION_ERROR_MESSAGE, useInvoiceDetail } from './invoice-detail-context'
import PaymentMethodField, { type PaymentMethodFieldHandle } from './payment-method-field'
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

const FIELD_CODES: Record<string, FieldName> = {
  paid_date_future: 'paidDate',
  invalid_paid_date: 'paidDate',
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
  const { applyChanges } = useAppointmentsCache()
  const ids = {
    paidDate: useId(),
    reference: useId(),
    paidDateError: useId(),
  }
  const methodRef = useRef<PaymentMethodFieldHandle>(null)

  const [paidDate, setPaidDate] = useState(initial?.paidDate ?? businessDate)
  const [reference, setReference] = useState(initial?.reference ?? '')
  const [fieldError, setFieldError] = useState<{ field: FieldName; message: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const paidDateError = fieldError?.field === 'paidDate' ? fieldError.message : null
  const methodError = fieldError?.field === 'method' ? fieldError.message : null

  function focusField(field: FieldName) {
    if (field === 'paidDate') {
      document.getElementById(ids.paidDate)?.focus()
    } else {
      methodRef.current?.focus()
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
        void applyChanges(result.appointmentIds)
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

      {/* An edit keeps the stored method; a payment saved without one starts on a placeholder
          rather than silently taking the first method. */}
      <PaymentMethodField
        ref={methodRef}
        methods={methods}
        storedMethod={initial ? initial.method : null}
        shouldPreselectFirst
        error={methodError}
        showManageLink
      />

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
