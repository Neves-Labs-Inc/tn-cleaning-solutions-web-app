import {
  BlockedBadge,
  RunStatusBadge,
} from "@/components/admin/payroll/payroll-badges";
import type { PeriodRun } from "@/lib/payroll/period-view";

type RunStatusBadgesProps = {
  run: PeriodRun;
};

// Status (+ Off-cycle), then Blocked while something stops the run's next step.
export default function RunStatusBadges({
  run,
}: RunStatusBadgesProps): React.ReactNode {
  return (
    <>
      <RunStatusBadge status={run.status} kind={run.kind} />
      {run.blockedReason === null ? null : <BlockedBadge />}
    </>
  );
}
