import AdjustmentRow from "@/components/admin/payroll/adjustment-row";
import LedgerEntryMeta from "@/components/admin/payroll/ledger-entry-meta";
import { SpecBadge } from "@/components/admin/payroll/payroll-badges";
import { NO_PAY_RATE_BADGE } from "@/components/ui/status-badge-tones";
import {
  formatDayLabel,
  NO_CLIENT_LABEL,
  NO_JOB_LABEL,
} from "@/lib/payroll/format";
import type { LedgerEntry } from "@/lib/payroll/ledger";
import { formatHoursMinutes } from "@/lib/payroll/period";
import { formatCents, formatRate, UNPRICED_LABEL } from "@/lib/pricing/money";

type LedgerEntryCardProps = {
  entry: LedgerEntry;
  cleanerId: string;
  isPaid: boolean;
};

// One pay line, stacked, for a narrow ledger.
export default function LedgerEntryCard({
  entry,
  cleanerId,
  isPaid,
}: LedgerEntryCardProps): React.ReactNode {
  return (
    <article className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {formatDayLabel(entry.date)}
          </p>
          <p className="font-semibold break-words">
            {entry.jobName ?? NO_JOB_LABEL}
          </p>
          <p className="text-sm break-words text-muted-foreground">
            {entry.clientName ?? NO_CLIENT_LABEL}
          </p>
        </div>
        {entry.amountCents === null ? (
          <p className="shrink-0 text-base text-muted-foreground">
            {UNPRICED_LABEL}
          </p>
        ) : (
          <p className="shrink-0 font-mono text-base font-semibold tabular-nums">
            {formatCents(entry.amountCents)}
          </p>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <span className="font-mono tabular-nums">
          {formatHoursMinutes(entry.minutes)} ×
        </span>
        {entry.rateCents === null ? (
          <SpecBadge spec={NO_PAY_RATE_BADGE} />
        ) : (
          <span className="font-mono tabular-nums">
            {formatRate(entry.rateCents)}
          </span>
        )}
      </p>
      <LedgerEntryMeta entry={entry} cleanerId={cleanerId} isPaid={isPaid} />
      {entry.adjustments.length > 0 ? (
        <div className="mt-2 divide-y border-t">
          {entry.adjustments.map((item) => (
            <AdjustmentRow key={item.id} adjustment={item} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
