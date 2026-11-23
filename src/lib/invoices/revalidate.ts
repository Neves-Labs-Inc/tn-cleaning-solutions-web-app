import { revalidatePath } from 'next/cache'

import { RECEIVABLES_PATH } from './paths.ts'

// Route patterns, not literal paths: the callers (appointment, scope and time-sheet actions) rarely
// know which client's invoice moved, so every client page and invoice page is refreshed.
const CLIENT_PAGE_ROUTE = '/(internal)/solutions/(admin)/clients/[id]/(overview)'
const INVOICE_PAGE_ROUTE = '/(internal)/solutions/(admin)/clients/[id]/invoices/[invoiceId]'

// Everything that shows an invoice's lines or totals: the client's Billing tab, the invoice page
// and Receivables.
export function revalidateBillingPages(): void {
  revalidatePath(CLIENT_PAGE_ROUTE, 'page')
  revalidatePath(INVOICE_PAGE_ROUTE, 'page')
  revalidatePath(RECEIVABLES_PATH)
}
