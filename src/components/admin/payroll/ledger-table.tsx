import { Fragment } from "react";

import AdjustmentRow from "@/components/admin/payroll/adjustment-row";
import LedgerEntryMeta from "@/components/admin/payroll/ledger-entry-meta";
import { SpecBadge } from "@/components/admin/payroll/payroll-badges";
import { NO_PAY_RATE_BADGE } from "@/components/ui/status-badge-tones";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDayLabel,
  NO_CLIENT_LABEL,
  NO_JOB_LABEL,
} from "@/lib/payroll/format";
import type { LedgerEntry } from "@/lib/payroll/ledger";
import { formatHoursMinutes } from "@/lib/payroll/period";
import { formatCents, formatRate, UNPRICED_LABEL } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type LedgerTableProps = {
  entries: LedgerEntry[];
  cleanerName: string;
  cleanerId: string;
  isPaid: boolean;
  // Unpaid in an ended period: each Adjustment line gets its Delete button.
  canDeleteAdjustments: boolean;
};

const HEAD_CLASS_NAME =
  "px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase";
// Date | Job | Clocked | Rate | Amount; Adjustment rows skip the Date column.
const ADJUSTMENT_COLUMN_SPAN = 4;

// The pay lines as a table, for a wide ledger.
export default function LedgerTable({
  entries,
  cleanerName,
  cleanerId,
  isPaid,
  canDeleteAdjustments,
}: LedgerTableProps): React.ReactNode {
  return (
    <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
      {/* Fixed widths keep the columns in line from one expanded run to the next. */}
      <Table className="table-fixed text-sm">
        <caption className="sr-only">{cleanerName}&apos;s pay lines</caption>
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEAD_CLASS_NAME, "w-28")}>Date</TableHead>
            <TableHead className={HEAD_CLASS_NAME}>Job</TableHead>
            <TableHead className={cn(HEAD_CLASS_NAME, "w-24 text-right")}>
              Clocked
            </TableHead>
            <TableHead className={cn(HEAD_CLASS_NAME, "w-32 text-right")}>
              Rate
            </TableHead>
            <TableHead className={cn(HEAD_CLASS_NAME, "w-28 text-right")}>
              Amount
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <Fragment key={entry.appointmentEmployeeId}>
              <TableRow
                className={cn(
                  "hover:bg-transparent",
                  // Its Adjustments row follows with no rule between, so they read as one entry.
                  entry.adjustments.length > 0 && "border-b-0",
                )}
              >
                <TableCell className="px-3 py-2 align-top">
                  {formatDayLabel(entry.date)}
                </TableCell>
                <TableCell className="px-3 py-2 align-top whitespace-normal">
                  <p className="font-medium break-words">
                    {entry.jobName ?? NO_JOB_LABEL}
                  </p>
                  <p className="text-xs break-words text-muted-foreground">
                    {entry.clientName ?? NO_CLIENT_LABEL}
                  </p>
                  <LedgerEntryMeta
                    entry={entry}
                    cleanerId={cleanerId}
                    isPaid={isPaid}
                  />
                </TableCell>
                <TableCell className="px-3 py-2 text-right align-top font-mono tabular-nums">
                  {formatHoursMinutes(entry.minutes)}
                </TableCell>
                <TableCell className="px-3 py-2 text-right align-top whitespace-normal">
                  {entry.rateCents === null ? (
                    <SpecBadge spec={NO_PAY_RATE_BADGE} />
                  ) : (
                    <span className="font-mono tabular-nums">
                      {formatRate(entry.rateCents)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-3 py-2 text-right align-top">
                  {entry.amountCents === null ? (
                    <span className="text-muted-foreground">
                      {UNPRICED_LABEL}
                    </span>
                  ) : (
                    <span className="font-mono font-semibold tabular-nums">
                      {formatCents(entry.amountCents)}
                    </span>
                  )}
                </TableCell>
              </TableRow>
              {entry.adjustments.length > 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell />
                  <TableCell
                    colSpan={ADJUSTMENT_COLUMN_SPAN}
                    className="px-3 pb-2 whitespace-normal"
                  >
                    {entry.adjustments.map((item) => (
                      <AdjustmentRow
                        key={item.id}
                        adjustment={item}
                        isDeletable={canDeleteAdjustments}
                      />
                    ))}
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
