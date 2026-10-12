"use client";

import { useSearchParams } from "next/navigation";

import AppointmentsLoadError from "@/components/admin/appointments-load-error";
import AppointmentsScreenSkeleton from "@/components/admin/appointments-screen-skeleton";
import { AppointmentsViewToggle } from "@/components/admin/appointments-view-toggle";
import { useAppointmentsScreen } from "@/hooks/use-appointments-screen";
import { resolveFilterOptions } from "@/lib/appointments/filters";
import {
  appointmentsHref,
  parseAppointmentsSearch,
  type AppointmentsQuery,
} from "@/lib/appointments/overview";

type AppointmentsScreenProps = {
  businessDate: string;
};

// The appointments screen below its header. The URL holds the query; the data comes from the
// client cache, so view, filter and cached range changes never wait on the server.
export default function AppointmentsScreen({
  businessDate,
}: AppointmentsScreenProps): React.ReactNode {
  const query = parseAppointmentsSearch(useSearchParams(), businessDate);
  const screen = useAppointmentsScreen(query, businessDate);

  function handleNavigate(next: AppointmentsQuery): void {
    // Pushed (not replaced), so Back steps through ranges, layouts and filter changes. Next syncs
    // useSearchParams with it, without a server round trip or a scroll.
    window.history.pushState(null, "", appointmentsHref(next));
  }

  let content: React.ReactNode;
  if (screen.status === "loading") {
    content = <AppointmentsScreenSkeleton />;
  } else if (screen.status === "error") {
    content = (
      <AppointmentsLoadError
        onRetry={screen.onRetry}
        isRetrying={screen.isRetrying}
      />
    );
  } else {
    const { data } = screen;
    content = (
      <AppointmentsViewToggle
        // A client or job the selects can't show reads as All, so it never filters unseen.
        query={resolveFilterOptions(query, data.filterOptions)}
        range={data.range}
        isRangePending={screen.isRangePending}
        overview={data.overview}
        appointments={data.appointments}
        // Only the Needs billing view lists them; the tile above already has its total.
        needsBilling={query.view === "needs-billing" ? data.needsBilling : []}
        needsCompletion={
          query.view === "needs-completion" ? data.needsCompletion : []
        }
        methods={data.methods}
        filterOptions={data.filterOptions}
        businessDate={businessDate}
        onNavigate={handleNavigate}
      />
    );
  }
  return content;
}
