"use client";

import { useRef } from "react";
import { CheckCircle2 } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCompleteAppointments } from "@/hooks/use-complete-appointments";
import type { NeedsCompletionAppointment } from "@/lib/appointments/needs-completion";
import { getCompletionConfirmTitle } from "@/lib/appointments/needs-completion-view";
import type { ScheduleAppointment } from "@/lib/appointments/overview";
import { cn } from "@/lib/utils";

import AppointmentsList from "./appointments-list";
import NeedsCompletionBar from "./needs-completion-bar";

type AppointmentsNeedsCompletionProps = {
  // Every Not clocked appointment, oldest first.
  appointments: NeedsCompletionAppointment[];
  businessDate: string;
};

const CONFIRM_DESCRIPTION =
  "They'll be marked completed by admin with no clocked hours and move to Needs billing.";

// A Not clocked appointment is still scheduled and, being unfinished, unclaimed.
function toListRow(appointment: NeedsCompletionAppointment): ScheduleAppointment {
  return {
    id: appointment.id,
    clientId: appointment.clientId,
    clientName: appointment.clientName,
    jobId: appointment.jobId,
    jobName: appointment.jobName,
    scheduledDate: appointment.scheduledDate,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: "scheduled",
    priceCents: appointment.priceCents,
    paymentState: null,
    claim: null,
    isNotClocked: true,
  };
}

// The Needs completion view: every Not clocked appointment across months, any of them
// selectable, and the bar that marks the selected ones complete.
export default function AppointmentsNeedsCompletion({
  appointments,
  businessDate,
}: AppointmentsNeedsCompletionProps): React.ReactNode {
  const completion = useCompleteAppointments(appointments);
  const selectAllRef = useRef<HTMLElement>(null);
  const isBarOpen = completion.selected.length > 0;

  return (
    <>
      <div className="space-y-1 border-b px-4 py-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Needs completion
        </h2>
        <p className="text-sm text-muted-foreground">
          All months, oldest first. Past appointments nobody clocked into.
        </p>
      </div>

      {appointments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCircle2 aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Nothing needs completion.</EmptyTitle>
            <EmptyDescription>
              Past appointments nobody clocked into show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // Room under the last row so the open bar never covers it.
        <div className={cn(isBarOpen && "pb-40 md:pb-24")}>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b pr-4 text-sm transition-colors duration-fast active:bg-muted md:hover:bg-muted/60">
            <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center pl-2">
              <Checkbox
                ref={selectAllRef}
                aria-label={completion.selectAll.label}
                checked={completion.selectAll.state === "all"}
                indeterminate={completion.selectAll.state === "some"}
                onCheckedChange={completion.toggleAll}
              />
            </span>
            <span className="min-w-0">{completion.selectAll.label}</span>
          </label>
          <AppointmentsList
            appointments={appointments.map(toListRow)}
            businessDate={businessDate}
            selection={{
              selectedIds: completion.selectedIds,
              lockedClientId: null,
              onToggle: completion.toggle,
            }}
          />
        </div>
      )}

      <NeedsCompletionBar
        selected={completion.selected}
        onClear={completion.clear}
        onMarkComplete={completion.openDialog}
      />

      <ConfirmDialog
        open={completion.isDialogOpen}
        onOpenChange={completion.setDialogOpen}
        title={getCompletionConfirmTitle(completion.dialogCount)}
        description={CONFIRM_DESCRIPTION}
        confirmLabel="Mark complete"
        pendingLabel="Marking…"
        keepLabel="Keep as is"
        confirmVariant="default"
        onConfirm={completion.confirm}
        // Once the selection clears, the bar and its Mark complete button are gone from reach.
        returnFocusRef={isBarOpen ? undefined : selectAllRef}
      />
    </>
  );
}
