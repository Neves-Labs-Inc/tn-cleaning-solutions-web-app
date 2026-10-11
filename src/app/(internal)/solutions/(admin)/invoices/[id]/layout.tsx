import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { invoiceExists } from '@/lib/invoices/queries'
import { createClient } from '@/lib/supabase/server'

type InvoiceLayoutProps = {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

// loading.tsx makes the page stream, and a streamed response is already 200 when the page calls
// notFound(). So a document request checks the id here, above that boundary, to answer 404. In-app
// navigations and prefetches skip the check so the skeleton still shows at once; their status is moot.
// Next strips its own `rsc` flight header from headers(), so the router's fetches are told apart by the
// browser's `Sec-Fetch-Dest: empty` (document loads send `document`, curl sends nothing and is checked).
export default async function InvoiceLayout({ children, params }: InvoiceLayoutProps) {
  const isRouterFetch = (await headers()).get('sec-fetch-dest') === 'empty'
  if (!isRouterFetch) {
    const { id } = await params
    if (!(await invoiceExists(await createClient(), id))) notFound()
  }

  return children
}
