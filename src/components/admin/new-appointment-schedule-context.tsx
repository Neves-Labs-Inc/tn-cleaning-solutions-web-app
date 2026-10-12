"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronUp } from "lucide-react";

import { ScheduleContextBody } from "@/components/admin/schedule-context-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useScheduleContext } from "@/hooks/use-schedule-context";

type AppointmentScheduleContextProps = {
  initialMonth: number;
  initialYear: number;
  currentAppointmentId?: string;
  showNewAppointmentLink?: boolean;
};

const DESKTOP_QUERY = "(min-width: 1024px)";

export function AppointmentScheduleContext({
  initialMonth,
  initialYear,
  currentAppointmentId,
  showNewAppointmentLink,
}: AppointmentScheduleContextProps): React.ReactNode {
  const schedule = useScheduleContext(initialMonth, initialYear);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // The drawer is portaled, so hiding its wrapper at lg+ would not close it.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    function handleChange(event: MediaQueryListEvent): void {
      if (event.matches) setIsDrawerOpen(false);
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return (
    <>
      <div className="lg:hidden">
        {/* vaul defaults autoFocus to false, which leaves focus (and Tab) on the form behind the overlay. */}
        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen} autoFocus>
          <DrawerTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between transition-[background-color,transform,box-shadow] duration-fast focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] active:bg-muted"
            >
              <span className="flex min-w-0 items-center gap-2">
                <CalendarDays aria-hidden="true" />
                <span className="truncate">Schedule · {schedule.monthLabel}</span>
              </span>
              <ChevronUp aria-hidden="true" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="sm:mx-auto sm:max-w-lg">
            <DrawerHeader className="group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
              <DrawerTitle>Schedule</DrawerTitle>
              <DrawerDescription>Showing appointments for {schedule.monthLabel}</DrawerDescription>
            </DrawerHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-4">
              <ScheduleContextBody
                schedule={schedule}
                currentAppointmentId={currentAppointmentId}
                showNewAppointmentLink={showNewAppointmentLink}
                onNavigate={() => setIsDrawerOpen(false)}
                listClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5 pt-1 pb-[calc(1rem+var(--safe-bottom))]"
              />
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <Card className="hidden lg:flex">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Schedule</CardTitle>
          <CardDescription>Showing appointments for {schedule.monthLabel}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ScheduleContextBody
            schedule={schedule}
            currentAppointmentId={currentAppointmentId}
            showNewAppointmentLink={showNewAppointmentLink}
            listClassName="mt-1 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto lg:p-0.5 lg:pr-1"
          />
        </CardContent>
      </Card>
    </>
  );
}
