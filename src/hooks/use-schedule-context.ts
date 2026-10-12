"use client";

import { useEffect, useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";

import { createClient } from "@/lib/supabase/browser";
import type { AppointmentStatus } from "@/lib/appointments/lifecycle";

export type ContextAppointmentRow = {
  id: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  status: AppointmentStatus;
  clients: { id: string; name: string } | null;
  jobs: { id: string; name: string } | null;
  client_locations: { label: string | null; address: string | null } | null;
  appointment_employees: Array<{
    id: string;
    employee_id: string;
    employees: { full_name: string } | null;
  }> | null;
};

type Single<T> = T[] | T | null;

type ContextAppointmentQueryRow = Omit<
  ContextAppointmentRow,
  "clients" | "jobs" | "client_locations" | "appointment_employees"
> & {
  clients: Single<{ id: string; name: string }>;
  jobs: Single<{ id: string; name: string }>;
  client_locations: Single<{ label: string | null; address: string | null }>;
  appointment_employees: Array<{
    id: string;
    employee_id: string;
    employees: Single<{ full_name: string }>;
  }> | null;
};

type FetchResult = {
  requestKey: string;
  appointments: ContextAppointmentRow[];
  error: string | null;
};

export type ScheduleContext = {
  month: number;
  year: number;
  monthLabel: string;
  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  appointments: ContextAppointmentRow[];
  isLoading: boolean;
  error: string | null;
  retry: () => void;
};

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function pickSingle<T>(value: Single<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizeRow(row: ContextAppointmentQueryRow): ContextAppointmentRow {
  return {
    ...row,
    clients: pickSingle(row.clients),
    jobs: pickSingle(row.jobs),
    client_locations: pickSingle(row.client_locations),
    appointment_employees: (row.appointment_employees ?? []).map((assignment) => ({
      ...assignment,
      employees: pickSingle(assignment.employees),
    })),
  };
}

// One owner of the month, year and fetch, so the desktop panel and the phone drawer share a request.
export function useScheduleContext(initialMonth: number, initialYear: number): ScheduleContext {
  const [month, setMonthState] = useState(initialMonth);
  const [year, setYearState] = useState(initialYear);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<FetchResult | null>(null);

  const requestKey = `${year}-${month}-${attempt}`;
  const monthLabel = format(new Date(year, month - 1, 1), "MMMM yyyy");

  useEffect(() => {
    let isActive = true;

    async function fetchAppointments(): Promise<void> {
      const contextDate = new Date(year, month - 1, 1);
      const { data, error } = await createClient()
        .from("appointments")
        .select(
          `
            id, scheduled_date, scheduled_start_time, scheduled_end_time, status,
            clients!inner ( id, name ),
            jobs!inner ( id, name ),
            client_locations ( label, address ),
            appointment_employees ( id, employee_id, employees!inner ( full_name ) )
          `,
        )
        .eq("is_archived", false)
        // A crew-removed Cleaner's archived assignment is history, not crew; NULL counts as live.
        .not("appointment_employees.is_archived", "is", true)
        .gte("scheduled_date", format(startOfMonth(contextDate), "yyyy-MM-dd"))
        .lte("scheduled_date", format(endOfMonth(contextDate), "yyyy-MM-dd"))
        .order("scheduled_date", { ascending: true })
        .order("scheduled_start_time", { ascending: true });

      if (!isActive) return;

      const rows = (data as unknown as ContextAppointmentQueryRow[] | null) ?? [];
      setResult({
        requestKey: `${year}-${month}-${attempt}`,
        appointments: error ? [] : rows.map(normalizeRow),
        error: error ? error.message : null,
      });
    }

    void fetchAppointments();

    return () => {
      isActive = false;
    };
  }, [month, year, attempt]);

  // A result for another month or attempt is stale: loading shows instead of the old rows.
  const current = result?.requestKey === requestKey ? result : null;

  function setMonth(value: number): void {
    if (Number.isInteger(value) && value >= 1 && value <= 12) setMonthState(value);
  }

  function setYear(value: number): void {
    if (Number.isInteger(value) && value >= MIN_YEAR && value <= MAX_YEAR) setYearState(value);
  }

  return {
    month,
    year,
    monthLabel,
    setMonth,
    setYear,
    appointments: current?.appointments ?? [],
    isLoading: current === null,
    error: current?.error ?? null,
    retry: () => setAttempt((value) => value + 1),
  };
}
