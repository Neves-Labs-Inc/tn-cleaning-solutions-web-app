import { updateDraft, type InvoiceActionResult } from '@/lib/actions/invoices'

import type { DraftDetails } from './invoice-detail-context'

type DraftUpdate = {
  invoiceId: string
  addIds?: string[]
  removeIds?: string[]
  // updateDraft overwrites both, so a line change sends the saved values and Save sends the form's.
  details: DraftDetails
}

// One way to post updateDraft's form, for line removal, Add visits and Save.
export function submitDraftUpdate({
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
  formData.set('due_date', details.dueDate)
  formData.set('notes', details.notes)
  return updateDraft(null, formData)
}
