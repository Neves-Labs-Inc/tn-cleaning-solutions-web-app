import Link from 'next/link'
import { Plus } from 'lucide-react'

import AppointmentsLoadError from '@/components/admin/appointments-load-error'
import { AppointmentsViewToggle } from '@/components/admin/appointments-view-toggle'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import { listFilterOptions } from '@/lib/appointments/filter-options'
import { resolveFilterOptions, type FilterOptions } from '@/lib/appointments/filters'
import { listMonthAppointments } from '@/lib/appointments/month-appointments'
import {
  parseAppointmentsQuery,
  summarizeOverview,
  type AppointmentsQuery,
  type ScheduleAppointment,
} from '@/lib/appointments/overview'
import { InvoiceLedger, type PaymentMethod } from '@/lib/invoices/ledger'
import { listNeedsBilling, type NeedsBillingAppointment } from '@/lib/invoices/payment-state-queries'
import { getBusinessDate } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'

type AppointmentsPageProps = {
  searchParams: Promise<{
    view?: string | string[]
    month?: string | string[]
    year?: string | string[]
    showCancelled?: string | string[]
    client?: string | string[]
    job?: string | string[]
    status?: string | string[]
  }>
}

type Db = Awaited<ReturnType<typeof createClient>>

type ScreenData = {
  appointments: ScheduleAppointment[]
  needsBilling: NeedsBillingAppointment[]
  methods: PaymentMethod[]
  filterOptions: FilterOptions
}

async function loadMethods(db: Db): Promise<PaymentMethod[]> {
  const result = await new InvoiceLedger(db).listPaymentMethods()
  if (!result.ok) throw new Error(`Couldn't load payment methods: ${result.message}`)
  return result.data
}

// Every read the screen needs, or null when any fails: the tiles never show partial totals.
// Payment methods are only read for Needs billing, whose bar opens the Mark paid dialog.
async function loadScreen(db: Db, query: AppointmentsQuery, now: Date): Promise<ScreenData | null> {
  let data: ScreenData | null

  try {
    const [appointments, needsBilling, methods, filterOptions] = await Promise.all([
      listMonthAppointments(db, query, now),
      listNeedsBilling(db),
      query.view === 'needs-billing' ? loadMethods(db) : Promise.resolve([]),
      listFilterOptions(db),
    ])
    data = { appointments, needsBilling, methods, filterOptions }
  } catch (thrown) {
    console.error('Error loading appointments:', query, thrown)
    data = null
  }

  return data
}

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps) {
  const now = new Date()
  const businessDate = getBusinessDate(now)
  const parsedQuery = parseAppointmentsQuery(await searchParams, businessDate)
  const data = await loadScreen(await createClient(), parsedQuery, now)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description="Plan, assign, and track appointments across your team."
        action={
          <Button
            className="w-full transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98] sm:w-auto"
            nativeButton={false}
            render={<Link href="/solutions/appointments/new" />}
          >
            <Plus aria-hidden="true" />
            New appointment
          </Button>
        }
      />

      {data ? (
        <AppointmentsViewToggle
          // A client or job the selects can't show reads as All, so it never filters unseen.
          query={resolveFilterOptions(parsedQuery, data.filterOptions)}
          overview={summarizeOverview(data.needsBilling, data.appointments)}
          appointments={data.appointments}
          // Only the Needs billing view lists them; the tile above already has its total.
          needsBilling={parsedQuery.view === 'needs-billing' ? data.needsBilling : []}
          methods={data.methods}
          filterOptions={data.filterOptions}
          businessDate={businessDate}
        />
      ) : (
        <AppointmentsLoadError />
      )}
    </div>
  )
}
