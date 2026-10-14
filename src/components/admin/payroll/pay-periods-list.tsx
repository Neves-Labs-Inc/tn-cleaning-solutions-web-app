import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";

import {
  BlockedBadge,
  FlagCountBadge,
  PeriodStatusBadge,
  SpecBadge,
} from "@/components/admin/payroll/payroll-badges";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { UNPAID_AFTER_FINALIZE_BADGE } from "@/components/ui/status-badge-tones";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPeriodRowCaption } from "@/lib/payroll/format";
import type { PeriodRow } from "@/lib/payroll/period-summary";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type PayPeriodsListProps = {
  rows: PeriodRow[];
};

const HEAD_CLASS_NAME =
  "px-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase";

function formatStragglerCount(count: number): string {
  return `${count} unpaid shift${count === 1 ? "" : "s"} after finalize`;
}

function hasAttention(row: PeriodRow): boolean {
  return (
    row.blockedCount > 0 ||
    row.stragglerCount > 0 ||
    (row.flagCount > 0 && row.status.kind !== "paid")
  );
}

// Blocked runs, flags (not on a Paid period) and stragglers.
function AttentionBadges({ row }: { row: PeriodRow }): React.ReactNode {
  return (
    <>
      {row.blockedCount > 0 ? (
        <BlockedBadge label={`${row.blockedCount} blocked`} />
      ) : null}
      {row.status.kind === "paid" ? null : (
        <FlagCountBadge count={row.flagCount} />
      )}
      {row.stragglerCount > 0 ? (
        <SpecBadge
          spec={UNPAID_AFTER_FINALIZE_BADGE}
          label={formatStragglerCount(row.stragglerCount)}
        />
      ) : null}
    </>
  );
}

function NoPeriods(): React.ReactNode {
  return (
    <div className="rounded-lg bg-card ring-1 ring-foreground/10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Wallet aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No pay periods yet</EmptyTitle>
          <EmptyDescription>
            Payroll starts with the period beginning Mon Oct 5, 2026.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export default function PayPeriodsList({
  rows,
}: PayPeriodsListProps): React.ReactNode {
  if (rows.length === 0) return <NoPeriods />;

  return (
    <>
      <ul className="grid gap-3 xl:hidden" aria-label="Pay periods">
        {rows.map((row) => (
          <li key={row.period.start}>
            <Link
              href={row.href}
              className="flex min-h-16 w-full cursor-pointer items-start justify-between gap-3 rounded-lg bg-card p-4 shadow-sm ring-1 ring-foreground/10 transition-[background-color,box-shadow] duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted md:hover:ring-foreground/20"
            >
              <div className="min-w-0">
                <p className="font-semibold break-words">{row.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatPeriodRowCaption(row)}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <PeriodStatusBadge kind={row.status.kind} />
                  <AttentionBadges row={row} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="font-mono font-semibold tabular-nums">
                  {formatCents(row.totalCents)}
                </span>
                <ChevronRight
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
        <Table className="text-sm">
          <caption className="sr-only">Pay periods, newest first</caption>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className={HEAD_CLASS_NAME}>Pay period</TableHead>
              <TableHead className={HEAD_CLASS_NAME}>Status</TableHead>
              <TableHead className={cn(HEAD_CLASS_NAME, "text-right")}>
                Cleaners
              </TableHead>
              <TableHead className={cn(HEAD_CLASS_NAME, "text-right")}>
                Total
              </TableHead>
              <TableHead className={HEAD_CLASS_NAME}>Needs attention</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.period.start}
                className="group relative h-14 cursor-pointer duration-fast active:bg-muted"
              >
                <TableCell className="px-4 whitespace-normal">
                  <Link
                    href={row.href}
                    className={cn(
                      "font-semibold whitespace-nowrap underline-offset-4 outline-none after:absolute after:inset-0 md:hover:underline",
                      "focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset",
                    )}
                  >
                    {row.label}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatPeriodRowCaption(row)}
                  </p>
                </TableCell>
                <TableCell className="px-4">
                  <PeriodStatusBadge kind={row.status.kind} />
                </TableCell>
                <TableCell className="px-4 text-right tabular-nums">
                  {row.cleanerCount}
                </TableCell>
                <TableCell className="px-4 text-right font-mono font-semibold tabular-nums">
                  {formatCents(row.totalCents)}
                </TableCell>
                <TableCell className="px-4 whitespace-normal">
                  {hasAttention(row) ? (
                    <div className="flex flex-wrap gap-1">
                      <AttentionBadges row={row} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <ChevronRight
                    className="size-4 text-muted-foreground transition-transform duration-fast ease-out-quart md:group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
