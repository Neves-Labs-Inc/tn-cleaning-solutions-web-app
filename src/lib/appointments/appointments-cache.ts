import type { QueryClient } from "@tanstack/react-query";

import { loadAppointmentWeeks } from "@/lib/actions/appointments-screen";
import { WeeksBatcher } from "@/lib/appointments/weeks-batcher";

// The appointments screen's client cache: its query keys, and the batcher wired to its server
// action. Every key sits under APPOINTMENTS_KEY, so one invalidation drops them all.

export const APPOINTMENTS_KEY = ["appointments"] as const;

export const appointmentsKeys = {
  week: (weekStart: string) => [...APPOINTMENTS_KEY, "week", weekStart] as const,
  needsBilling: [...APPOINTMENTS_KEY, "needs-billing"] as const,
  needsCompletion: [...APPOINTMENTS_KEY, "needs-completion"] as const,
  filterOptions: [...APPOINTMENTS_KEY, "filter-options"] as const,
  paymentMethods: [...APPOINTMENTS_KEY, "payment-methods"] as const,
};

const batchers = new WeakMap<QueryClient, WeeksBatcher>();

// One batcher per cache, writing the extra weeks a read returns into that cache.
export function getWeeksBatcher(queryClient: QueryClient): WeeksBatcher {
  const existing = batchers.get(queryClient);
  if (existing !== undefined) return existing;

  const batcher = new WeeksBatcher(loadAppointmentWeeks, (week, appointments) =>
    queryClient.setQueryData(appointmentsKeys.week(week), appointments),
  );
  batchers.set(queryClient, batcher);
  return batcher;
}
