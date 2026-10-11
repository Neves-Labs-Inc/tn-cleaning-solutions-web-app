import Link from 'next/link'
import { Plus } from 'lucide-react'

import AppointmentsLoadError from '@/components/admin/appointments-load-error'
import { AppointmentsViewToggle } from '@/components/admin/appointments-view-toggle'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/ui/page-header'
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
  }>
}

type Db = Awaited<ReturnType<typeof createClient>>

type ScreenData = {
  appointments: ScheduleAppointment[]
  needsBilling: NeedsBillingAppointment[]
  methods: PaymentMethod[]
}

async function loadMethods(db: Db): Promise<PaymentMethod[]> {
  const result = await new InvoiceLedger(db).listPaymentMethods()
  if (!result.ok) throw new Error(`Couldn't load payment methods: ${result.message}`)
  return result.data
}

// Every read the screen needs, or null when any fails: the tiles never show partial totals.
// Payment methods are only read for Needs billing, whose bar opens the Mark paid dialog.
async function loadScreen(db: Db, query: AppointmentsQuery): Promise<ScreenData | null> {
  let data: ScreenData | null

  try {
    const [appointments, needsBilling, methods] = await Promise.all([
      listMonthAppointments(db, query),
      listNeedsBilling(db),
      query.view === 'needs-billing' ? loadMethods(db) : Promise.resolve([]),
    ])
    data = { appointments, needsBilling, methods }
  } catch (thrown) {
    console.error('Error loading appointments:', query, thrown)
    data = null
  }

  return data
}

export default async function AppointmentsPage({ searchParams }: AppointmentsPageProps) {
  const businessDate = getBusinessDate(new Date())
  const query = parseAppointmentsQuery(await searchParams, businessDate)
  const data = await loadScreen(await createClient(), query)

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
          query={query}
          overview={summarizeOverview(data.needsBilling, data.appointments)}
          appointments={data.appointments}
          // Only the Needs billing view lists them; the tile above already has its total.
          needsBilling={query.view === 'needs-billing' ? data.needsBilling : []}
          methods={data.methods}
          businessDate={businessDate}
        />
      ) : (
        <AppointmentsLoadError />
      )}
    </div>
  )
}
