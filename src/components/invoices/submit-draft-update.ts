import { useInvalidateAppointments } from '@/hooks/use-invalidate-appointments'
import { updateDraft, type InvoiceActionResult } from '@/lib/actions/invoices'

import type { DraftDetails } from './invoice-detail-context'

type DraftUpdate = {
  invoiceId: string
  addIds?: string[]
  removeIds?: string[]
  // Only Save sends details. A line change leaves the stored due date and notes as they are, so a
  // stale page can't overwrite them.
  details?: DraftDetails
}

// One way to post updateDraft's form, for line removal, Add visits and Save.
function submitDraftUpdate({
  invoiceId,
  addIds = [],
  removeIds = [],
  details,
}: DraftUpdate): Promise<InvoiceActionResult<{ isDeleted: boolean }>> {
  const formData = new FormData()
  formData.set('invoice_id', invoiceId)
  for (const id of addIds) {
    formData.append('add_appointment_ids', id)
  }
  for (const id of removeIds) {
    formData.append('remove_appointment_ids', id)
  }
  if (details) {
    formData.set('write_details', 'true')
    formData.set('due_date', details.dueDate)
    formData.set('notes', details.notes)
  }
  return updateDraft(null, formData)
}

type SubmitDraftUpdate = typeof submitDraftUpdate

// submitDraftUpdate that also drops the appointments cache once the draft saved.
export function useSubmitDraftUpdate(): SubmitDraftUpdate {
  const invalidateAppointments = useInvalidateAppointments()

  return async (update) => {
    const result = await submitDraftUpdate(update)
    if (result.success) void invalidateAppointments()
    return result
  }
}
