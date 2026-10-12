"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { DAY_HEADERS } from "./appointments-calendar";

type AppointmentsMonthGridSkeletonProps = {
  month: number;
  year: number;
};

// The desktop month grid with no appointments yet. It lays out the same days as
// AppointmentsCalendar, so the row count matches the month it is standing in for.
export default function AppointmentsMonthGridSkeleton({
  month,
  year,
}: AppointmentsMonthGridSkeletonProps): React.ReactNode {
  const monthDate = new Date(year, month - 1, 1);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(monthDate)),
    end: endOfWeek(endOfMonth(monthDate)),
  });

  return (
    <div aria-hidden="true" className="p-4">
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="bg-muted px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {days.map((day) => (
          <div
            key={format(day, "yyyy-MM-dd")}
            className={cn(
              "min-h-32 min-w-0 bg-card p-1.5",
              !isSameMonth(day, monthDate) && "bg-muted/40",
            )}
          >
            <Skeleton className="size-7 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
