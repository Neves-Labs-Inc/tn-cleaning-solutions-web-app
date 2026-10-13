"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import AppointmentsLoadError from "@/components/admin/appointments-load-error";
import AppointmentsScreenSkeleton from "@/components/admin/appointments-screen-skeleton";
import { AppointmentsViewToggle } from "@/components/admin/appointments-view-toggle";
import { useAppointmentsScreen } from "@/hooks/use-appointments-screen";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNeighbourPrefetch } from "@/hooks/use-neighbour-prefetch";
import { resolveFilterOptions } from "@/lib/appointments/filters";
import { browserListStorage, rememberListHref } from "@/lib/appointments/list-return";
import {
  appointmentsHref,
  parseAppointmentsSearch,
  type AppointmentsQuery,
} from "@/lib/appointments/overview";
import { getPhoneQuery } from "@/lib/appointments/range";

type AppointmentsScreenProps = {
  businessDate: string;
};

// The appointments screen below its header. The URL holds the query; the data comes from the
// client cache, so view, filter and cached range changes never wait on the server.
export default function AppointmentsScreen({
  businessDate: serverBusinessDate,
}: AppointmentsScreenProps): React.ReactNode {
  const businessDate = useBusinessDate(serverBusinessDate);
  const query = parseAppointmentsSearch(useSearchParams(), businessDate);
  const screen = useAppointmentsScreen(query, businessDate);
  const currentHref = appointmentsHref(query);
  const isMobile = useIsMobile();
  const phoneHref = appointmentsHref(getPhoneQuery(query, businessDate));
  // Phones have no way out of Month, so it becomes the List, on load and when the viewport
  // shrinks. Replaced (not pushed), so Back never bounces into Month. The server snapshot is
  // desktop, so this runs after hydration.
  useEffect(() => {
    if (isMobile && phoneHref !== currentHref) {
      window.history.replaceState(null, "", phoneHref);
    }
  }, [isMobile, phoneHref, currentHref]);
  // Remembered per tab so the ways back to the list (detail, New, save, sidebar) restore this state.
  useEffect(() => {
    rememberListHref(browserListStorage(), currentHref);
  }, [currentHref]);
  useNeighbourPrefetch(
    query,
    businessDate,
    screen.status === "ready" && screen.rangeState.status === "ready"
      ? screen.rangeState.updatedAt
      : null,
  );

  function handleNavigate(next: AppointmentsQuery): void {
    // Pushed (not replaced), so Back steps through ranges, layouts and filter changes. Next syncs
    // useSearchParams with it, without a server round trip or a scroll.
    window.history.pushState(null, "", appointmentsHref(next));
  }

  let content: React.ReactNode;
  if (screen.status === "loading") {
    content = <AppointmentsScreenSkeleton query={query} />;
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
        rangeState={screen.rangeState}
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
