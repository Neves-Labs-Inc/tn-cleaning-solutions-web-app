import StatusBadge from "@/components/ui/status-badge";
import { TIME_SHEET_FLAG_SPECS } from "@/components/ui/status-badge-tones";
import { FLAG_KINDS, type FlagKind } from "@/lib/time-sheets/session-view";

type FlagCountBadgesProps = {
  counts: Record<FlagKind, number>;
  isCompact?: boolean;
};

const COMPACT_LABELS: Record<FlagKind, string> = {
  open_shift: "Open",
  missing_clock: "Missing",
  odd_duration: "Odd",
};

export default function FlagCountBadges({
  counts,
  isCompact = false,
}: FlagCountBadgesProps): React.ReactNode {
  const presentKinds = FLAG_KINDS.filter((kind) => counts[kind] > 0);
  if (presentKinds.length === 0) {
    return <span className="text-sm text-muted-foreground">No flags</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {presentKinds.map((kind) => {
        const spec = TIME_SHEET_FLAG_SPECS[kind];
        return (
          <StatusBadge key={kind} tone={spec.tone} icon={spec.icon}>
            {counts[kind]} {isCompact ? COMPACT_LABELS[kind] : spec.label}
          </StatusBadge>
        );
      })}
    </div>
  );
}
