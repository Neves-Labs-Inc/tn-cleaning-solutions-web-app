import AppointmentsListSkeleton from "./appointments-list-skeleton";
import AppointmentsNeedsHeader, {
  type AppointmentsNeedsView,
} from "./appointments-needs-header";

interface AppointmentsNeedsSkeletonProps {
  view: AppointmentsNeedsView;
}

// The Needs billing and Needs completion card: their real header, then the list.
export default function AppointmentsNeedsSkeleton({
  view,
}: AppointmentsNeedsSkeletonProps): React.ReactNode {
  return (
    <div aria-hidden="true">
      <AppointmentsNeedsHeader view={view} />
      <AppointmentsListSkeleton />
    </div>
  );
}
