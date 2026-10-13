"use client";

import Link from "next/link";
import { format } from "date-fns";
import { CalendarX2, CircleAlert, Plus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge, { appointmentStatusBadge } from "@/components/ui/status-badge";
import type { ContextAppointmentRow, ScheduleContext } from "@/hooks/use-schedule-context";
import { cn } from "@/lib/utils";

type ScheduleContextBodyProps = {
  schedule: ScheduleContext;
  currentAppointmentId?: string;
  showNewAppointmentLink?: boolean;
  onNavigate?: () => void;
  // Panel: the list scrolls in a capped box. Drawer: it fills the drawer and scrolls there.
  listClassName?: string;
};

type ScheduleRowProps = {
  appointment: ContextAppointmentRow;
  isCurrent: boolean;
  onNavigate?: () => void;
};

const SKELETON_ROWS = 4;
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const YEAR_OPTIONS = Array.from({ length: 101 }, (_, index) => 2000 + index);
const ACTION_CLASSES = cn(
  OUTLINE_PRESS_CLASS_NAME,
  "focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

function formatLocation(appointment: ContextAppointmentRow): string | null {
  const label = appointment.client_locations?.label?.trim();
  const address = appointment.client_locations?.address?.trim();
  return label || address ? [label, address].filter(Boolean).join(" - ") : null;
}

function ScheduleRow({ appointment, isCurrent, onNavigate }: ScheduleRowProps): React.ReactNode {
  const spec = appointmentStatusBadge(appointment.status);
  const location = formatLocation(appointment);
  const dateLabel = format(new Date(`${appointment.scheduled_date}T00:00:00`), "EEE, MMM d");
  const crew = (appointment.appointment_employees ?? [])
    .map((assignment) => assignment.employees?.full_name ?? "Unknown employee")
    .join(", ");

  return (
    <Link
      href={`/solutions/appointments/${appointment.id}/edit`}
      onClick={onNavigate}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "flex min-h-16 min-w-0 cursor-pointer flex-col gap-1 rounded-lg bg-card px-3 py-3 text-sm ring-1 ring-foreground/10 transition-[background-color,box-shadow] duration-fast focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:outline-none active:bg-muted md:hover:ring-foreground/20",
        isCurrent && "bg-muted ring-2 ring-primary md:hover:ring-primary",
      )}
    >
      {isCurrent ? <span className="text-xs font-semibold text-foreground">This appointment</span> : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <p className="min-w-0 font-medium text-foreground">
          {dateLabel} ·{" "}
          <span className="font-mono tabular-nums">
            {appointment.scheduled_start_time.slice(0, 5)}–{appointment.scheduled_end_time.slice(0, 5)}
          </span>
        </p>
        <StatusBadge tone={spec.tone} icon={spec.icon}>
          {spec.label}
        </StatusBadge>
      </div>
      <p className="break-words text-foreground">
        {appointment.clients?.name ?? "Unknown client"} · {appointment.jobs?.name ?? "Unknown job"}
      </p>
      {location ? <p className="break-words text-xs text-muted-foreground">{location}</p> : null}
      <p className="break-words text-xs text-muted-foreground">Assigned: {crew || "Unassigned"}</p>
    </Link>
  );
}

function ScheduleList({
  schedule,
  currentAppointmentId,
  onNavigate,
  listClassName,
}: ScheduleContextBodyProps): React.ReactNode {
  const { appointments, isLoading, error, monthLabel, month, year, retry } = schedule;

  return (
    <div aria-busy={isLoading} className={listClassName}>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <span className="sr-only">Loading appointments for {monthLabel}</span>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Couldn&apos;t load the schedule.</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button
            variant="outline"
            className={cn("col-start-2 mt-2 justify-self-start", ACTION_CLASSES)}
            onClick={retry}
          >
            Try again
          </Button>
        </Alert>
      ) : appointments.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarX2 aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No appointments in {monthLabel}</EmptyTitle>
            <EmptyDescription>Pick another month to check other dates.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // Keyed on the month so each one crossfades in once.
        <div key={`${year}-${month}`} className="flex flex-col gap-3 animate-in duration-slow fade-in-0">
          {appointments.map((appointment) => (
            <ScheduleRow
              key={appointment.id}
              appointment={appointment}
              isCurrent={currentAppointmentId === appointment.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ScheduleContextBody(props: ScheduleContextBodyProps): React.ReactNode {
  const { schedule, showNewAppointmentLink, onNavigate } = props;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect
          aria-label="Month"
          className="w-full"
          value={String(schedule.month)}
          onChange={(event) => schedule.setMonth(Number(event.target.value))}
        >
          {MONTH_OPTIONS.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {format(new Date(2024, value - 1, 1), "MMMM")}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Year"
          className="w-full"
          value={String(schedule.year)}
          onChange={(event) => schedule.setYear(Number(event.target.value))}
        >
          {YEAR_OPTIONS.map((value) => (
            <NativeSelectOption key={value} value={value}>
              {value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {showNewAppointmentLink ? (
        <Button
          variant="outline"
          className={cn("w-full", ACTION_CLASSES)}
          nativeButton={false}
          render={<Link href="/solutions/appointments/new" onClick={onNavigate} />}
        >
          <Plus aria-hidden="true" />
          New appointment
        </Button>
      ) : null}
      <ScheduleList {...props} />
    </>
  );
}
