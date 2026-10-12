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

// How the range body stands. Show more keeps the rows already shown while the new weeks load.
export type RangeState =
  | { status: "ready" }
  // The target range has no cached data, so the body is a skeleton and `appointments` is empty.
  | { status: "loading" }
  | { status: "loading-more" }
  | { status: "more-error"; onRetry: () => void };

export type AppointmentsScreenData = {
  overview: Overview;
  // The range the body shows: the target, or while Show more loads, the range shown so far.
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
  | { status: "ready"; data: AppointmentsScreenData; rangeState: RangeState };

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

// Show more widens a List or Week read from the same first week, so the rows already shown are
// the start of the new range.
function isShowMore(shown: RangeQuery, target: RangeQuery): boolean {
  return (
    shown.layout !== "month" &&
    shown.layout === target.layout &&
    shown.from === target.from &&
    target.weeks > shown.weeks
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
  // The last range whose weeks were all cached: the rows Show more keeps while the new weeks load.
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
  const weeks = [...new Set([...targetWeeks, ...monthWeeks])];

  const weekResults = useQueries({
    queries: weeks.map((week) => ({
      queryKey: appointmentsKeys.week(week),
      queryFn: () => batcher.load(week),
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

  const isMore =
    targetChunks === null &&
    shownRange !== null &&
    shownChunks !== null &&
    isShowMore(shownRange, targetRange);
  const displayed = isMore
    ? { range: shownRange, chunks: shownChunks }
    : { range: targetRange, chunks: targetChunks ?? [] };

  const targetReads = weeks.flatMap((week, index) =>
    targetWeeks.includes(week) && !monthWeeks.includes(week)
      ? [weekResults[index]]
      : [],
  );
  const otherReads: Array<UseQueryResult<unknown>> = [
    ...weeks.flatMap((week, index) =>
      monthWeeks.includes(week) || !isMore ? [weekResults[index]] : [],
    ),
    needsBilling,
    needsCompletion,
    filterOptions,
    ...(isNeedsBilling ? [methods] : []),
  ];
  // errorUpdateCount, not isError: v5 resets a refetched query with no data to pending, which
  // would swap the error card for the skeleton mid-retry. A successful fetch fills data.
  const hasFailed = (read: UseQueryResult<unknown>): boolean =>
    read.data === undefined && read.errorUpdateCount > 0;
  const failedReads = otherReads.filter(hasFailed);
  // While Show more loads, its new weeks failing only fails the extra rows, not the screen.
  const failedMoreReads = isMore ? targetReads.filter(hasFailed) : [];

  let rangeState: RangeState = { status: "ready" };
  if (isMore && failedMoreReads.some((read) => !read.isFetching)) {
    rangeState = {
      status: "more-error",
      onRetry: () => {
        for (const read of failedMoreReads) void read.refetch();
      },
    };
  } else if (isMore) {
    rangeState = { status: "loading-more" };
  } else if (targetChunks === null) {
    rangeState = { status: "loading" };
  }

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
    monthChunks === null ||
    needsBilling.data === undefined ||
    needsCompletion.data === undefined ||
    filterOptions.data === undefined
  ) {
    screen = { status: "loading" };
  } else {
    screen = {
      status: "ready",
      rangeState,
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
