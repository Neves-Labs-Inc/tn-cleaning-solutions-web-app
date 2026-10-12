import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type { NeedsBillingAppointment } from "../invoices/payment-state-queries.ts";
import type { AppointmentChanges } from "./appointment-changes.ts";
import { APPOINTMENTS_KEY, appointmentsKeys } from "./appointments-keys.ts";
import { discardAppointments } from "./discard-appointments.ts";
import type { NeedsCompletionAppointment } from "./needs-completion.ts";
import type { ScheduleAppointment } from "./overview.ts";
import { getWeekStart } from "./range.ts";
import { compareAppointments } from "./weeks.ts";

// Updates the appointments screen's client cache in place after a change, so returning to the
// list shows the change at once with no skeleton and no full reread. Pure over a QueryClient,
// no React, so node:test drives it against a real cache. setQueryData restarts each patched
// query's staleness clock and never fetches.

export type NameChange = { kind: "client" | "job"; id: string; name: string };

type AppointmentRow =
  | ScheduleAppointment
  | NeedsBillingAppointment
  | NeedsCompletionAppointment;

const WEEKS_KEY = [...APPOINTMENTS_KEY, "week"] as const;
// appointmentsKeys.week(weekStart) puts the week start here.
const WEEK_START_INDEX = 2;

// The list with the changed ids' rows swapped for the fresh ones, in the full read's order, or
// null when nothing in it changes.
function patchRows<T extends AppointmentRow>(
  rows: T[],
  changedIds: Set<string>,
  freshRows: T[],
): T[] | null {
  const kept = rows.filter((row) => !changedIds.has(row.id));
  const isUnchanged = kept.length === rows.length && freshRows.length === 0;
  return isUnchanged ? null : [...kept, ...freshRows].sort(compareAppointments);
}

// Patches a cached list; an uncached (or reset) one stays that way.
function patchCachedList<T extends AppointmentRow>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  changedIds: Set<string>,
  freshRows: T[],
): void {
  const rows = queryClient.getQueryData<T[]>(queryKey);
  if (rows === undefined) return;

  const patched = patchRows(rows, changedIds, freshRows);
  if (patched !== null) queryClient.setQueryData(queryKey, patched);
}

// Every cached week drops the changed ids' rows and takes the fresh rows dated in it. A row whose
// week isn't cached is left for that week's own read: a week is never created here.
export function applyAppointmentChanges(
  queryClient: QueryClient,
  changes: AppointmentChanges,
): void {
  const changedIds = new Set(changes.ids);

  const cachedWeeks = queryClient.getQueriesData<ScheduleAppointment[]>({
    queryKey: WEEKS_KEY,
  });
  for (const [queryKey] of cachedWeeks) {
    const week = queryKey[WEEK_START_INDEX];
    const freshRows = changes.schedule.filter(
      (row) => getWeekStart(row.scheduledDate) === week,
    );
    patchCachedList(queryClient, queryKey, changedIds, freshRows);
  }

  patchCachedList(
    queryClient,
    appointmentsKeys.needsBilling,
    changedIds,
    changes.needsBilling,
  );
  patchCachedList(
    queryClient,
    appointmentsKeys.needsCompletion,
    changedIds,
    changes.needsCompletion,
  );
}

// Reads the changed appointments and patches them in. When the read fails the whole appointments
// cache is discarded instead, so rows from before the change never show.
export async function updateAppointmentsCache(
  queryClient: QueryClient,
  ids: string[],
  loadChanges: (ids: string[]) => Promise<AppointmentChanges>,
): Promise<void> {
  if (ids.length === 0) return;

  try {
    applyAppointmentChanges(queryClient, await loadChanges(ids));
  } catch (error) {
    console.error("updateAppointmentsCache: falling back to a discard", {
      idCount: ids.length,
      error,
    });
    await discardAppointments(queryClient);
  }
}

// Marks queries stale and keeps their rows: active ones refetch now, inactive ones on their next
// view, showing the cached rows meanwhile. No keys means every appointments query.
export async function refreshAppointments(
  queryClient: QueryClient,
  keys: QueryKey[] = [APPOINTMENTS_KEY],
): Promise<void> {
  await Promise.all(
    keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

function renameRow<T extends AppointmentRow>(row: T, change: NameChange): T {
  if (change.kind === "client" && row.clientId === change.id) {
    return { ...row, clientName: change.name };
  }
  if (change.kind === "job" && row.jobId === change.id) {
    return { ...row, jobName: change.name };
  }
  return row;
}

// Rewrites a renamed client's or Job's name on every cached row that shows it, with no read.
export function renameInAppointments(
  queryClient: QueryClient,
  change: NameChange,
): void {
  const cachedLists = [
    ...queryClient.getQueriesData<AppointmentRow[]>({ queryKey: WEEKS_KEY }),
    ...queryClient.getQueriesData<AppointmentRow[]>({
      queryKey: appointmentsKeys.needsBilling,
    }),
    ...queryClient.getQueriesData<AppointmentRow[]>({
      queryKey: appointmentsKeys.needsCompletion,
    }),
  ];
  for (const [queryKey, rows] of cachedLists) {
    const renamed = rows?.map((row) => renameRow(row, change));
    const isChanged = renamed?.some((row, index) => row !== rows?.[index]);
    if (isChanged) queryClient.setQueryData(queryKey, renamed);
  }
}
