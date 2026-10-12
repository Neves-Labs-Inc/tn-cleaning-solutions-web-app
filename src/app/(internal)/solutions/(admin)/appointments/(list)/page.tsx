import Link from 'next/link'
import { Plus } from 'lucide-react'

import AppointmentsLoadError from '@/components/admin/appointments-load-error'
import { AppointmentsViewToggle } from '@/components/admin/appointments-view-toggle'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
import { listFilterOptions } from '@/lib/appointments/filter-options'
import { resolveFilterOptions, type FilterOptions } from '@/lib/appointments/filters'
import { listMonthAppointments, listRangeAppointments } from '@/lib/appointments/month-appointments'
import { listNeedsCompletion, type NeedsCompletionAppointment } from '@/lib/appointments/needs-completion'
import {
  parseAppointmentsQuery,
  summarizeOverview,
  type AppointmentsQuery,
  type ScheduleAppointment,
} from '@/lib/appointments/overview'
import { getReadRange } from '@/lib/appointments/range'
import { InvoiceLedger, type PaymentMethod } from '@/lib/invoices/ledger'
import { listNeedsBilling, type NeedsBillingAppointment } from '@/lib/invoices/payment-state-queries'
import { getBusinessDate } from '@/lib/schedule'
import { createClient } from '@/lib/supabase/server'

type AppointmentsPageProps = {
  searchParams: Promise<{
    view?: string | string[]
    layout?: string | string[]
    from?: string | string[]
    weeks?: string | string[]
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
  // The visible range's appointments.
  appointments: ScheduleAppointment[]
  // The business month's, for the Billed and Paid tiles whatever the range.
  businessMonthAppointments: ScheduleAppointment[]
  needsBilling: NeedsBillingAppointment[]
  needsCompletion: NeedsCompletionAppointment[]
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
async function loadScreen(
  db: Db,
  query: AppointmentsQuery,
  businessDate: string,
  now: Date
): Promise<ScreenData | null> {
  const [businessYear, businessMonth] = businessDate.split('-').map(Number)
  const isBusinessMonth = query.layout === 'month' && query.month === businessMonth && query.year === businessYear
  let data: ScreenData | null

  try {
    const [
      appointments,
      businessMonthAppointments,
      needsBilling,
      needsCompletion,
      methods,
      filterOptions,
    ] = await Promise.all([
      listRangeAppointments(db, getReadRange(query, businessDate), now),
      // The Month layout on the business month already read these.
      isBusinessMonth ? null : listMonthAppointments(db, { month: businessMonth, year: businessYear }, now),
      listNeedsBilling(db),
      listNeedsCompletion(db, now),
      query.view === 'needs-billing' ? loadMethods(db) : Promise.resolve([]),
      listFilterOptions(db),
    ])
    data = {
      appointments,
      businessMonthAppointments: businessMonthAppointments ?? appointments,
      needsBilling,
      needsCompletion,
      methods,
      filterOptions,
    }
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
  const data = await loadScreen(await createClient(), parsedQuery, businessDate, now)

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
          overview={summarizeOverview(data.needsBilling, data.businessMonthAppointments, data.needsCompletion)}
          appointments={data.appointments}
          // Only the Needs billing view lists them; the tile above already has its total.
          needsBilling={parsedQuery.view === 'needs-billing' ? data.needsBilling : []}
          needsCompletion={parsedQuery.view === 'needs-completion' ? data.needsCompletion : []}
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
