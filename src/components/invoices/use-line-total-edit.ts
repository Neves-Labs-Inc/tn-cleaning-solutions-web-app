'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { useAppointmentsCache } from '@/hooks/use-appointments-cache'
import { setDraftLinePrice } from '@/lib/actions/invoices'
import { AMOUNT_TOO_LARGE_MESSAGE, parseDollarsToCents } from '@/lib/pricing/money'

import { CONNECTION_ERROR_MESSAGE } from './invoice-detail-context'

export const INVALID_AMOUNT_MESSAGE = 'Enter a valid dollar amount.'

type PendingAction = 'save' | 'clear'

type UseLineTotalEditOptions = {
  invoiceId: string
  appointmentId: string
  amountCents: number | null
  onClose: () => void
  onPendingChange: (isPending: boolean) => void
}

// The input starts at the line's current amount, with no commas or $ (parseDollarsToCents rejects them).
function initialValue(amountCents: number | null): string {
  return amountCents === null ? '' : (amountCents / 100).toFixed(2)
}

// Submit and clear state for one line's inline total editor.
export function useLineTotalEdit({ invoiceId, appointmentId, amountCents, onClose, onPendingChange }: UseLineTotalEditOptions) {
  const router = useRouter()
  const { applyChanges } = useAppointmentsCache()
  const [value, setValue] = useState(() => initialValue(amountCents))
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  function changeValue(next: string) {
    setValue(next)
    setFieldError(null)
  }

  async function run(action: PendingAction, formData: FormData, successMessage: string) {
    setFormError(null)
    setPendingAction(action)
    onPendingChange(true)

    try {
      const result = await setDraftLinePrice(null, formData)
      if (result.success) {
        void applyChanges(result.appointmentIds)
        toast.success(successMessage)
        onClose()
        router.refresh()
      } else if ('fieldErrors' in result) {
        setFieldError(result.fieldErrors.amount)
      } else {
        // No refresh on a refusal: it would unmount the editor and the message with it.
        setFormError(result.error)
      }
    } catch (thrown) {
      console.error('Set line total failed:', thrown)
      setFormError(CONNECTION_ERROR_MESSAGE)
    }
    setPendingAction(null)
    onPendingChange(false)
  }

  function baseForm(): FormData {
    const formData = new FormData()
    formData.set('invoice_id', invoiceId)
    formData.set('appointment_id', appointmentId)
    return formData
  }

  async function save() {
    const amount = parseDollarsToCents(value)
    if ('error' in amount) {
      setFieldError(amount.error === 'too_large' ? AMOUNT_TOO_LARGE_MESSAGE : INVALID_AMOUNT_MESSAGE)
      return
    }

    const formData = baseForm()
    formData.set('amount', value)
    await run('save', formData, 'Total updated')
  }

  async function clear() {
    const formData = baseForm()
    formData.set('clear', '1')
    await run('clear', formData, 'Using calculated price')
  }

  return { value, changeValue, fieldError, formError, pendingAction, save, clear }
}
