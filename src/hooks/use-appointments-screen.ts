"use client";

import { useState } from "react";
import {
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  loadFilterOptions,
  loadNeedsBilling,
  loadNeedsCompletion,
  loadPaymentMethods,
} from "@/lib/actions/appointments-screen";
import {
  appointmentsKeys,
  getWeeksBatcher,
} from "@/lib/appointments/appointments-cache";
import type { FilterOptions } from "@/lib/appointments/filters";
import type { NeedsCompletionAppointment } from "@/lib/appointments/needs-completion";
import {
  summarizeOverview,
  type AppointmentsQuery,
  type Overview,
  type ScheduleAppointment,
} from "@/lib/appointments/overview";
import {
  getMonthRange,
  getReadRange,
  type RangeQuery,
} from "@/lib/appointments/range";
import { mergeWeeks, weeksForRange } from "@/lib/appointments/weeks";
import type { PaymentMethod } from "@/lib/invoices/ledger";
import type { NeedsBillingAppointment } from "@/lib/invoices/payment-state-queries";

export type AppointmentsScreenData = {
  overview: Overview;
  // The range on screen: the target once its weeks are cached, else the last one shown.
  range: RangeQuery;
  // That range's appointments.
  appointments: ScheduleAppointment[];
  needsBilling: NeedsBillingAppointment[];
  needsCompletion: NeedsCompletionAppointment[];
  filterOptions: FilterOptions;
  // Read once Needs billing opens; null until then and while loading.
  methods: PaymentMethod[] | null;
};

export type AppointmentsScreen =
  | { status: "loading" }
  | { status: "error"; isRetrying: boolean; onRetry: () => void }
  | {
      status: "ready";
      data: AppointmentsScreenData;
      // The target range has no cached data yet, so `data.range` is still the previous one.
      isRangePending: boolean;
    };

type WeekResult = UseQueryResult<ScheduleAppointment[]>;

function rangeOf({ layout, from, weeks, month, year }: RangeQuery): RangeQuery {
  return { layout, from, weeks, month, year };
}

function isSameRange(left: RangeQuery, right: RangeQuery): boolean {
  return (
    left.layout === right.layout &&
    left.from === right.from &&
    left.weeks === right.weeks &&
    left.month === right.month &&
    left.year === right.year
  );
}

// Every week's appointments, or null while any week has no data yet.
function readWeeks(
  weeks: string[],
  results: Map<string, WeekResult>,
): ScheduleAppointment[][] | null {
  const chunks = weeks.map((week) => results.get(week)?.data);
  return chunks.every((chunk) => chunk !== undefined) ? chunks : null;
}

// Everything the appointments screen shows, read through the client cache. The visible range and
// the business month (Billed and Paid tiles) are cached per week; Needs billing, Needs completion
// and the filter options whole; payment methods only once Needs billing opens. Any read with no
// data that failed makes the screen an error; a failed background refetch keeps its data quietly.
export function useAppointmentsScreen(
  query: AppointmentsQuery,
  businessDate: string,
): AppointmentsScreen {
  const queryClient = useQueryClient();
  const batcher = getWeeksBatcher(queryClient);
  // The last range whose weeks were all cached, shown dimmed while the next one loads.
  const [shownRange, setShownRange] = useState<RangeQuery | null>(null);

  const [businessYear, businessMonth] = businessDate.split("-").map(Number);
  const monthRange = getMonthRange(businessMonth, businessYear);
  const targetRange = rangeOf(query);
  const targetWeeks = weeksForRange(getReadRange(targetRange, businessDate));
  const monthWeeks = weeksForRange(monthRange);
  const shownWeeks =
    shownRange === null
      ? []
      : weeksForRange(getReadRange(shownRange, businessDate));
  const fetchedWeeks = new Set([...targetWeeks, ...monthWeeks]);
  const weeks = [...new Set([...fetchedWeeks, ...shownWeeks])];

  const weekResults = useQueries({
    queries: weeks.map((week) => ({
      queryKey: appointmentsKeys.week(week),
      queryFn: () => batcher.load(week),
      // The shown range's other weeks are only read back from the cache, never fetched.
      enabled: fetchedWeeks.has(week),
    })),
  });
  // Arrow wrappers, so the query context never reaches a server action as an argument.
  const needsBilling = useQuery({
    queryKey: appointmentsKeys.needsBilling,
    queryFn: () => loadNeedsBilling(),
  });
  const needsCompletion = useQuery({
    queryKey: appointmentsKeys.needsCompletion,
    queryFn: () => loadNeedsCompletion(),
  });
  const filterOptions = useQuery({
    queryKey: appointmentsKeys.filterOptions,
    queryFn: () => loadFilterOptions(),
  });
  const isNeedsBilling = query.view === "needs-billing";
  const methods = useQuery({
    queryKey: appointmentsKeys.paymentMethods,
    queryFn: () => loadPaymentMethods(),
    enabled: isNeedsBilling,
  });

  const resultsByWeek = new Map(
    weeks.map((week, index) => [week, weekResults[index]]),
  );
  const targetChunks = readWeeks(targetWeeks, resultsByWeek);
  const monthChunks = readWeeks(monthWeeks, resultsByWeek);
  const shownChunks =
    shownRange === null ? null : readWeeks(shownWeeks, resultsByWeek);
  if (
    targetChunks !== null &&
    (shownRange === null || !isSameRange(shownRange, targetRange))
  ) {
    setShownRange(targetRange);
  }

  const displayed =
    targetChunks !== null
      ? { range: targetRange, chunks: targetChunks }
      : shownRange !== null && shownChunks !== null
        ? { range: shownRange, chunks: shownChunks }
        : null;
  const neededReads: Array<UseQueryResult<unknown>> = [
    ...weekResults.filter((_, index) => fetchedWeeks.has(weeks[index])),
    needsBilling,
    needsCompletion,
    filterOptions,
    ...(isNeedsBilling ? [methods] : []),
  ];
  // errorUpdateCount, not isError: v5 resets a refetched query with no data to pending, which
  // would swap the error card for the skeleton mid-retry. A successful fetch fills data.
  const failedReads = neededReads.filter(
    (read) => read.data === undefined && read.errorUpdateCount > 0,
  );

  let screen: AppointmentsScreen;
  if (failedReads.length > 0) {
    screen = {
      status: "error",
      isRetrying: failedReads.some((read) => read.isFetching),
      onRetry: () => {
        for (const read of failedReads) void read.refetch();
      },
    };
  } else if (
    displayed === null ||
    monthChunks === null ||
    needsBilling.data === undefined ||
    needsCompletion.data === undefined ||
    filterOptions.data === undefined
  ) {
    screen = { status: "loading" };
  } else {
    screen = {
      status: "ready",
      isRangePending: targetChunks === null,
      data: {
        overview: summarizeOverview(
          needsBilling.data,
          mergeWeeks(monthChunks, monthRange),
          needsCompletion.data,
        ),
        range: displayed.range,
        appointments: mergeWeeks(
          displayed.chunks,
          getReadRange(displayed.range, businessDate),
        ),
        needsBilling: needsBilling.data,
        needsCompletion: needsCompletion.data,
        filterOptions: filterOptions.data,
        methods: methods.data ?? null,
      },
    };
  }
  return screen;
}
