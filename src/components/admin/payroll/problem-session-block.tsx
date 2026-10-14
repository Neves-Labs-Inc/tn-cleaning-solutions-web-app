import ArrowLinkButton from "@/components/admin/payroll/arrow-link-button";
import { BlockedBadge, SpecBadge } from "@/components/admin/payroll/payroll-badges";
import { CARD_TINT_CLASSES } from "@/components/ui/status-badge";
import { TIME_SHEET_FLAG_SPECS } from "@/components/ui/status-badge-tones";
import {
  describeProblemSession,
  formatDayLabel,
  NO_CLIENT_LABEL,
  NO_JOB_LABEL,
} from "@/lib/payroll/format";
import type { ProblemSession, RunStatus } from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type ProblemSessionBlockProps = {
  problem: ProblemSession;
  runStatus: RunStatus;
};

// An Open shift or Missing clock at $0. It's fixed on Time Sheets, never in Payroll.
export default function ProblemSessionBlock({
  problem,
  runStatus,
}: ProblemSessionBlockProps): React.ReactNode {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 text-sm @xl:flex-row @xl:items-center",
        CARD_TINT_CLASSES.danger,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{formatDayLabel(problem.date)}</span>
          <SpecBadge spec={TIME_SHEET_FLAG_SPECS[problem.kind]} />
          <BlockedBadge
            label={
              runStatus === "finalized" ? "Blocks mark paid" : "Blocks finalize"
            }
          />
        </div>
        <p className="break-words">
          {problem.jobName ?? NO_JOB_LABEL} ·{" "}
          {problem.clientName ?? NO_CLIENT_LABEL}
        </p>
        <p className="text-xs text-muted-foreground">
          {describeProblemSession(problem)}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 @xl:justify-end">
        <span className="font-mono tabular-nums">{formatCents(0)}</span>
        <ArrowLinkButton href={problem.href}>Fix on Time Sheets</ArrowLinkButton>
      </div>
    </div>
  );
}
