import { Fragment } from "react";

import ExpandChevron from "@/components/admin/payroll/expand-chevron";
import PayRunLedger from "@/components/admin/payroll/pay-run-ledger";
import { FlagCountBadge } from "@/components/admin/payroll/payroll-badges";
import RunCleanerName from "@/components/admin/payroll/run-cleaner-name";
import RunStatusBadges from "@/components/admin/payroll/run-status-badges";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSignedCents } from "@/lib/payroll/format";
import { formatHoursMinutes } from "@/lib/payroll/period";
import type {
  PeriodRun,
  PeriodStatus,
  PeriodView,
} from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type PayRunTableProps = {
  runs: PeriodRun[];
  periodStatus: PeriodStatus;
  totals: PeriodView["totals"];
  expandedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
};

// Cleaner | Hours | Shift pay | Adjustments | Total | Flags | Status | expander. The one place
// the column count lives, so ticket 08 can add its checkbox column here.
const RUN_TABLE_COLUMN_COUNT = 8;
// Period total, hours, shift pay, Adjustments and total; the footer leaves the rest empty.
const FOOTER_FILLED_CELLS = 5;
const HEAD_CLASS_NAME =
  "px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase";
const NO_VALUE = "—";

function getPanelId(key: string): string {
  return `run-table-ledger-${key}`;
}

// Clicks on a link or button inside the row do their own thing; only the row's bare area toggles.
function isFromControl(target: EventTarget): boolean {
  return target instanceof Element && target.closest("a, button") !== null;
}

export default function PayRunTable({
  runs,
  periodStatus,
  totals,
  expandedKeys,
  onToggle,
}: PayRunTableProps): React.ReactNode {
  return (
    <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
      <Table className="text-sm">
        <caption className="sr-only">Pay runs in this period</caption>
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead className={HEAD_CLASS_NAME}>Cleaner</TableHead>
            <TableHead className={cn(HEAD_CLASS_NAME, "text-right")}>
              Hours
            </TableHead>
            <TableHead className={cn(HEAD_CLASS_NAME, "text-right")}>
              Shift pay
            </TableHead>
            <TableHead className={cn(HEAD_CLASS_NAME, "text-right")}>
              Adjustments
            </TableHead>
            <TableHead className={cn(HEAD_CLASS_NAME, "text-right")}>
              Total
            </TableHead>
            <TableHead className={HEAD_CLASS_NAME}>Flags</TableHead>
            <TableHead className={HEAD_CLASS_NAME}>Status</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Ledger</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const isOpen = expandedKeys.has(run.key);
            const panelId = getPanelId(run.key);
            return (
              <Fragment key={run.key}>
                <TableRow
                  className={cn(
                    "cursor-pointer duration-fast active:bg-muted",
                    // The primitive tints a row holding an open expander; keep it at /40.
                    isOpen && "bg-muted/40 has-aria-expanded:bg-muted/40",
                  )}
                  onClick={(event) => {
                    if (!isFromControl(event.target)) onToggle(run.key);
                  }}
                >
                  <TableCell className="px-3 py-3 whitespace-normal">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      aria-label={`${isOpen ? "Hide" : "Show"} ${run.cleaner.name}'s ledger`}
                      className="cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => onToggle(run.key)}
                    >
                      <RunCleanerName cleaner={run.cleaner} />
                    </button>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {formatHoursMinutes(run.minutes)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {formatCents(run.shiftPayCents)}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono tabular-nums">
                    {run.adjustments.length > 0
                      ? formatSignedCents(run.adjustmentsCents)
                      : NO_VALUE}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right font-mono font-semibold tabular-nums">
                    {formatCents(run.totalCents)}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <FlagCountBadge count={run.flagCount} />
                  </TableCell>
                  <TableCell className="px-3 py-3 whitespace-normal">
                    <span className="flex flex-wrap gap-1">
                      <RunStatusBadges run={run} />
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <ExpandChevron isOpen={isOpen} />
                  </TableCell>
                </TableRow>
                {isOpen ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      id={panelId}
                      colSpan={RUN_TABLE_COLUMN_COUNT}
                      className="bg-muted/30 px-4 py-4 whitespace-normal"
                    >
                      <div className="animate-in duration-base ease-out-quart fade-in-0 slide-in-from-top-1">
                        <PayRunLedger run={run} periodStatus={periodStatus} />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
        <TableFooter className="border-t-2 bg-muted/60 font-medium">
          <TableRow className="hover:bg-transparent">
            <TableCell className="px-3 py-2">Period total</TableCell>
            <TableCell className="px-3 py-2 text-right font-mono tabular-nums">
              {formatHoursMinutes(totals.minutes)}
            </TableCell>
            <TableCell className="px-3 py-2 text-right text-muted-foreground">
              {NO_VALUE}
            </TableCell>
            <TableCell className="px-3 py-2 text-right text-muted-foreground">
              {NO_VALUE}
            </TableCell>
            <TableCell className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
              {formatCents(totals.totalCents)}
            </TableCell>
            <TableCell colSpan={RUN_TABLE_COLUMN_COUNT - FOOTER_FILLED_CELLS} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
