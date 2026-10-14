import StatusBadge, { activeStateBadge } from "@/components/ui/status-badge";
import type { RunCleaner } from "@/lib/payroll/period-view";

type RunCleanerNameProps = {
  cleaner: RunCleaner;
};

const INACTIVE_BADGE = activeStateBadge(false);

// The Cleaner's name, wrapping rather than truncating, with an Inactive tag when she's inactive.
export default function RunCleanerName({
  cleaner,
}: RunCleanerNameProps): React.ReactNode {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="font-semibold break-words">{cleaner.name}</span>
      {cleaner.isActive ? null : (
        <StatusBadge tone={INACTIVE_BADGE.tone}>{INACTIVE_BADGE.label}</StatusBadge>
      )}
    </span>
  );
}
