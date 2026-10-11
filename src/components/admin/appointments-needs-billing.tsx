'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

import MarkPaidDialog from '@/components/invoices/mark-paid-dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { resolveBillingSelection, type ScheduleAppointment } from '@/lib/appointments/overview'
import type { PaymentMethod } from '@/lib/invoices/ledger'
import type { MarkPaidAppointment } from '@/lib/invoices/mark-paid'
import type { NeedsBillingAppointment } from '@/lib/invoices/payment-state-queries'
import { cn } from '@/lib/utils'

import AppointmentsList from './appointments-list'
import NeedsBillingBar from './needs-billing-bar'

type AppointmentsNeedsBillingProps = {
  // Every Unbilled appointment, oldest first.
  appointments: NeedsBillingAppointment[]
  methods: PaymentMethod[]
  businessDate: string
  // Shown instead of the view's own empty state when the filters leave nothing.
  filteredEmpty: React.ReactNode
}

type MarkPaidSelection = { appointments: MarkPaidAppointment[]; clientId: string; clientName: string }

const CLOSED_DIALOG: MarkPaidSelection = { appointments: [], clientId: '', clientName: '' }

// An Unbilled appointment is completed and unclaimed by definition.
function toListRow(appointment: NeedsBillingAppointment): ScheduleAppointment {
  return {
    id: appointment.id,
    clientId: appointment.clientId,
    clientName: appointment.clientName,
    jobId: appointment.jobId,
    jobName: appointment.jobName,
    scheduledDate: appointment.scheduledDate,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: 'completed',
    priceCents: appointment.livePriceCents,
    paymentState: 'unbilled',
    claim: null,
    isNotClocked: false,
  }
}

function toMarkPaidAppointment(appointment: NeedsBillingAppointment): MarkPaidAppointment {
  return {
    id: appointment.id,
    scheduledDate: appointment.scheduledDate,
    jobName: appointment.jobName,
    status: 'completed',
    livePriceCents: appointment.livePriceCents,
    claim: null,
    claimTotalCents: null,
  }
}

// The Needs billing view: the list across every month, one client's rows selectable at a time,
// and the bar that marks them paid or hands them to a new invoice.
export default function AppointmentsNeedsBilling({
  appointments,
  methods,
  businessDate,
  filteredEmpty,
}: AppointmentsNeedsBillingProps): React.ReactNode {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // The client is kept with the dialog's appointments, so it still reads right while the dialog
  // closes after the selection has cleared.
  const [dialog, setDialog] = useState<MarkPaidSelection>(CLOSED_DIALOG)

  // `appointments` is already filtered, so a row the filter hides drops out for good, and the
  // client lock and the bar follow what is visible.
  const visibleSelectedIds = selectedIds.filter((id) => appointments.some((appointment) => appointment.id === id))
  if (visibleSelectedIds.length !== selectedIds.length) setSelectedIds(visibleSelectedIds)

  const { selected, lockedClientId } = resolveBillingSelection(appointments, selectedIds)
  const isBarOpen = selected.length > 0

  function handleToggle(id: string): void {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    )
  }

  return (
    <>
      <div className="space-y-1 border-b px-4 py-3">
        <h2 className="text-lg font-semibold tracking-tight">Needs billing</h2>
        <p className="text-sm text-muted-foreground">All months, oldest first. Pick appointments of one client.</p>
      </div>

      {appointments.length === 0 && filteredEmpty ? (
        filteredEmpty
      ) : appointments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nothing needs billing.</EmptyTitle>
            <EmptyDescription>Completed appointments that aren&apos;t on an invoice show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // Room under the last row so the open bar never covers it.
        <div className={cn(isBarOpen && 'pb-40 md:pb-24')}>
          <AppointmentsList
            appointments={appointments.map(toListRow)}
            businessDate={businessDate}
            selection={{ selectedIds, lockedClientId, onToggle: handleToggle }}
          />
        </div>
      )}

      <NeedsBillingBar
        selected={selected}
        onClear={() => setSelectedIds([])}
        onMarkPaid={() =>
          setDialog({
            appointments: selected.map(toMarkPaidAppointment),
            clientId: selected[0].clientId,
            clientName: selected[0].clientName,
          })
        }
      />

      <MarkPaidDialog
        appointments={dialog.appointments}
        clientId={dialog.clientId}
        clientName={dialog.clientName}
        methods={methods}
        businessDate={businessDate}
        onSuccess={() => setSelectedIds([])}
        onClose={() => setDialog(CLOSED_DIALOG)}
      />
    </>
  )
}
