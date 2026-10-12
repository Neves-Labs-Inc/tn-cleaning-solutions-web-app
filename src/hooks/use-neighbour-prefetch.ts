"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  appointmentsKeys,
  getWeeksBatcher,
} from "@/lib/appointments/appointments-cache";
import type { AppointmentsQuery } from "@/lib/appointments/overview";
import { missingWeeks, neighbourWeeks } from "@/lib/appointments/weeks";

// Once the visible range has data, fetches the weeks Prev and Next would need into the cache so
// stepping to them is instant. Only the schedule has Prev and Next; weeks already cached are
// left alone; a failed prefetch is silent, since the step itself would load and report it.
// rangeUpdatedAt is when the visible range's data last landed, or null while it has none. Keyed
// on it, so after a change discards the neighbours, they are fetched again once the range refreshes.
export function useNeighbourPrefetch(
  query: AppointmentsQuery,
  businessDate: string,
  rangeUpdatedAt: number | null,
): void {
  const queryClient = useQueryClient();
  const isSchedule = query.view === "schedule";
  const weeksKey = neighbourWeeks(query, businessDate).join(",");

  useEffect(() => {
    if (!isSchedule || rangeUpdatedAt === null || weeksKey === "") return;

    const batcher = getWeeksBatcher(queryClient);
    const toFetch = missingWeeks(
      weeksKey.split(","),
      (week) =>
        queryClient.getQueryData(appointmentsKeys.week(week)) !== undefined,
    );
    // Same tick, so the batcher turns each side into one action call.
    for (const week of toFetch) {
      const queryKey = appointmentsKeys.week(week);
      void queryClient
        .prefetchQuery({ queryKey, queryFn: () => batcher.load(week) })
        .then(() => {
          // A failed prefetch stays silent: forget it, so stepping there loads fresh.
          const cached = queryClient
            .getQueryCache()
            .find({ queryKey, exact: true });
          const isFailedAndUnused =
            cached !== undefined &&
            cached.state.status === "error" &&
            cached.state.data === undefined &&
            cached.getObserversCount() === 0;
          if (isFailedAndUnused) {
            queryClient.removeQueries({ queryKey, exact: true });
          }
        });
    }
  }, [queryClient, isSchedule, rangeUpdatedAt, weeksKey]);
}
