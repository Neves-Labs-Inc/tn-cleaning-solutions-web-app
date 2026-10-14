import { AlertTriangle } from "lucide-react";

import ArrowLinkButton from "@/components/admin/payroll/arrow-link-button";
import OffCycleButton from "@/components/admin/payroll/off-cycle-button";
import { SpecBadge } from "@/components/admin/payroll/payroll-badges";
import { CARD_TINT_CLASSES } from "@/components/ui/status-badge";
import {
  TIME_SHEET_FLAG_SPECS,
  UNPAID_AFTER_FINALIZE_BADGE,
} from "@/components/ui/status-badge-tones";
import {
  formatDayLabel,
  NO_CLIENT_LABEL,
  NO_JOB_LABEL,
} from "@/lib/payroll/format";
import type { Straggler } from "@/lib/payroll/period-view";
import { cn } from "@/lib/utils";

type StragglersSectionProps = {
  stragglers: Straggler[];
};

// A problem straggler is fixed on Time Sheets; a closed one goes on an off-cycle run, unless an
// unpaid off-cycle run must be settled first (its note says so).
function StragglerAction({
  straggler,
}: {
  straggler: Straggler;
}): React.ReactNode {
  if (straggler.href !== null) {
    return (
      <ArrowLinkButton href={straggler.href}>Fix on Time Sheets</ArrowLinkButton>
    );
  }
  if (straggler.actionLabel === null) {
    return (
      <p className="text-sm text-muted-foreground">{straggler.note}</p>
    );
  }

  return <OffCycleButton cleaner={straggler.cleaner} />;
}

// Shifts left out of the period's finalized or paid runs.
export default function StragglersSection({
  stragglers,
}: StragglersSectionProps): React.ReactNode {
  return (
    <section
      aria-labelledby="stragglers-heading"
      className={cn(
        "space-y-2 rounded-lg border p-4",
        CARD_TINT_CLASSES.danger,
      )}
    >
      <h2 id="stragglers-heading" className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        {UNPAID_AFTER_FINALIZE_BADGE.label}
      </h2>
      <ul className="space-y-3">
        {stragglers.map((straggler) => (
          <li
            key={straggler.key}
            className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="break-words text-foreground">
                <span className="font-semibold">{straggler.cleaner.name}</span>
                {" · "}
                {formatDayLabel(straggler.session.date)}
                {" · "}
                {straggler.session.jobName ?? NO_JOB_LABEL}
                {" · "}
                {straggler.session.clientName ?? NO_CLIENT_LABEL}
              </p>
              {straggler.problem === null ? null : (
                <SpecBadge spec={TIME_SHEET_FLAG_SPECS[straggler.problem]} />
              )}
            </div>
            <div className="shrink-0">
              <StragglerAction straggler={straggler} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
