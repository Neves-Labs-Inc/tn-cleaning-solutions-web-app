const CLIENTS_PATH = '/solutions/clients'

export const RECEIVABLES_PATH = '/solutions/receivables'

export function invoiceHref(clientId: string, invoiceId: string): string {
  return `${CLIENTS_PATH}/${clientId}/invoices/${invoiceId}`
}

// Ids stay literal commas: uuids need no encoding, and the picker splits on ",".
export function clientBillingHref(clientId: string, pickIds: string[] = []): string {
  const base = `${CLIENTS_PATH}/${clientId}?tab=billing`
  return pickIds.length > 0 ? `${base}&pick=${pickIds.join(',')}` : base
}
