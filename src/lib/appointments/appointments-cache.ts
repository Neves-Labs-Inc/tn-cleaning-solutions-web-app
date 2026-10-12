import type { QueryClient } from "@tanstack/react-query";

import { loadAppointmentWeeks } from "@/lib/actions/appointments-screen";
import { appointmentsKeys } from "@/lib/appointments/appointments-keys";
import { WeeksBatcher } from "@/lib/appointments/weeks-batcher";

// The appointments screen's client cache: its query keys, and the batcher wired to its server
// action.

export { APPOINTMENTS_KEY, appointmentsKeys } from "@/lib/appointments/appointments-keys";

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
