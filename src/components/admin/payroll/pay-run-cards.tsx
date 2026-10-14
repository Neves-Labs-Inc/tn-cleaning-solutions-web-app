import ExpandChevron from "@/components/admin/payroll/expand-chevron";
import PayRunLedger from "@/components/admin/payroll/pay-run-ledger";
import { FlagCountBadge } from "@/components/admin/payroll/payroll-badges";
import RunCleanerName from "@/components/admin/payroll/run-cleaner-name";
import RunStatusBadges from "@/components/admin/payroll/run-status-badges";
import { Checkbox } from "@/components/ui/checkbox";
import type { PeriodSelection } from "@/hooks/use-period-selection";
import { formatSignedCents } from "@/lib/payroll/format";
import { formatHoursMinutes } from "@/lib/payroll/period";
import type {
  PeriodRun,
  PeriodStatus,
  PeriodView,
} from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type PayRunCardsProps = {
  runs: PeriodRun[];
  periodStatus: PeriodStatus;
  totals: PeriodView["totals"];
  expandedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  // null on a running period: nothing is selectable.
  selection: PeriodSelection | null;
  isSelectionDisabled: boolean;
};

function getPanelId(key: string): string {
  return `run-card-ledger-${key}`;
}

// Below xl: one card per run, its header a button that opens the ledger under it.
export default function PayRunCards({
  runs,
  periodStatus,
  totals,
  expandedKeys,
  onToggle,
  selection,
  isSelectionDisabled,
}: PayRunCardsProps): React.ReactNode {
  return (
    <div className="space-y-3 xl:hidden">
      <ul className="space-y-3" aria-label="Pay runs">
        {runs.map((run) => {
          const isOpen = expandedKeys.has(run.key);
          const panelId = getPanelId(run.key);
          const isSelectable = selection !== null && run.status !== "paid";
          const isSelected = selection?.isSelected(run.key) ?? false;
          return (
            <li
              key={run.key}
              data-run-key={run.key}
              className="animate-in scroll-mt-24 duration-base ease-out-quart fade-in-0 slide-in-from-top-1"
            >
              <article
                className={cn(
                  "rounded-lg bg-card ring-1 ring-foreground/10 transition-[box-shadow] duration-fast",
                  isSelected && "ring-2 ring-primary",
                )}
              >
                <div className="flex items-stretch">
                  {isSelectable ? (
                    <label className="flex w-12 shrink-0 cursor-pointer items-center justify-center rounded-tl-lg border-r border-border transition-colors duration-fast active:bg-muted md:hover:bg-muted">
                      <Checkbox
                        checked={isSelected}
                        disabled={isSelectionDisabled}
                        aria-label={`Select ${run.cleaner.name}'s run`}
                        onCheckedChange={() => selection.toggle(run.key)}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex min-h-16 min-w-0 flex-1 cursor-pointer items-start justify-between gap-3 rounded-lg p-4 text-left transition-colors duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted"
                    onClick={() => onToggle(run.key)}
                  >
                    <span className="min-w-0 space-y-1">
                      <RunCleanerName cleaner={run.cleaner} />
                      <span className="block text-sm text-muted-foreground">
                        <span className="font-mono tabular-nums">
                          {formatHoursMinutes(run.minutes)}
                        </span>
                        {" · shifts "}
                        <span className="font-mono tabular-nums">
                          {formatCents(run.shiftPayCents)}
                        </span>
                        {run.adjustments.length > 0 ? (
                          <>
                            {" · adj "}
                            <span className="font-mono tabular-nums">
                              {formatSignedCents(run.adjustmentsCents)}
                            </span>
                          </>
                        ) : null}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1">
                        <RunStatusBadges run={run} />
                        <FlagCountBadge count={run.flagCount} />
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className="font-mono text-base font-semibold tabular-nums">
                        {formatCents(run.totalCents)}
                      </span>
                      <ExpandChevron isOpen={isOpen} />
                    </span>
                  </button>
                </div>
                {isOpen ? (
                  <div
                    id={panelId}
                    className="animate-in border-t bg-muted/30 p-3 duration-base ease-out-quart fade-in-0 slide-in-from-top-1"
                  >
                    <PayRunLedger run={run} periodStatus={periodStatus} />
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-4 py-3 text-sm font-medium">
        <span>Period total</span>
        <span className="flex gap-4 font-mono tabular-nums">
          <span>{formatHoursMinutes(totals.minutes)}</span>
          <span>{formatCents(totals.totalCents)}</span>
        </span>
      </div>
    </div>
  );
}
