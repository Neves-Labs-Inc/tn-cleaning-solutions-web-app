import StatTile from "@/components/ui/stat-tile";
import { formatMinutes } from "@/components/admin/time-sheets/format-minutes";
import type { CleanerSummary } from "@/lib/time-sheets/summaries";

type SummaryTilesProps = {
  summaries: CleanerSummary[];
};

export default function SummaryTiles({
  summaries,
}: SummaryTilesProps): React.ReactNode {
  const closedMinutes = summaries.reduce(
    (total, summary) => total + summary.closedMinutes,
    0,
  );
  const sessionCount = summaries.reduce(
    (total, summary) => total + summary.sessionCount,
    0,
  );
  const flagTotal = summaries.reduce(
    (total, summary) => total + summary.flagTotal,
    0,
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatTile
        label="Clocked"
        value={formatMinutes(closedMinutes)}
        caption="Open shifts excluded"
        fitValue
      />
      <StatTile label="Sessions" value={String(sessionCount)} fitValue />
      <StatTile
        label="Flags"
        value={String(flagTotal)}
        caption={flagTotal > 0 ? "Need a look" : "All clear"}
        fitValue
        className="col-span-2 sm:col-span-1"
      />
    </div>
  );
}
