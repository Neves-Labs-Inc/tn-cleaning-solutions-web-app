import Link from "next/link";
import { ChevronRight, SearchX, UsersRound } from "lucide-react";

import FlagCountBadges from "@/components/admin/time-sheets/flag-count-badges";
import { formatMinutes } from "@/components/admin/time-sheets/format-minutes";
import { buildTimeSheetsHref } from "@/components/admin/time-sheets/time-sheets-href";
import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WeekRange } from "@/lib/time-sheets/range";
import type { CleanerSummary } from "@/lib/time-sheets/summaries";
import { cn } from "@/lib/utils";

type CleanerSummaryListProps = {
  // Already narrowed by the search; `totalCount` is every active Cleaner.
  summaries: CleanerSummary[];
  totalCount: number;
  range: WeekRange;
  q?: string;
};

type NoMatchProps = {
  q: string;
  range: WeekRange;
};

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
// Dims while a search is loading; the wrapper in TimeSheetsSearch sets data-pending.
const PENDING_DIM_CLASS_NAME =
  "transition-opacity duration-fast group-data-pending/search:opacity-60";
const INVITE_PATH = "/solutions/employees/invite";

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function NoMatch({ q, range }: NoMatchProps): React.ReactNode {
  return (
    <div className="rounded-lg bg-card ring-1 ring-foreground/10">
      <Empty className="animate-in duration-base ease-out-quart fade-in-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle className="[overflow-wrap:anywhere]">
            No Cleaners match &quot;{q}&quot;
          </EmptyTitle>
          <EmptyDescription>
            Check the spelling or try part of the name.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href={buildTimeSheetsHref({ from: range.from, to: range.to })}
            className={cn(
              buttonVariants({ variant: "outline" }),
              OUTLINE_PRESS_CLASS_NAME,
            )}
          >
            Clear search
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export default function CleanerSummaryList({
  summaries,
  totalCount,
  range,
  q,
}: CleanerSummaryListProps): React.ReactNode {
  const search = q?.trim() ?? "";

  if (totalCount === 0) {
    return (
      <div className="rounded-lg bg-card ring-1 ring-foreground/10">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No Cleaners yet</EmptyTitle>
            <EmptyDescription>
              Invite a Cleaner and their hours will show here.
            </EmptyDescription>
          </EmptyHeader>
          <Link
            href={INVITE_PATH}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Invite Cleaner
          </Link>
        </Empty>
      </div>
    );
  }

  if (summaries.length === 0) return <NoMatch q={search} range={range} />;

  const hrefFor = (summary: CleanerSummary) =>
    buildTimeSheetsHref({
      cleaner: summary.cleaner.id,
      from: range.from,
      to: range.to,
      q: search,
    });

  return (
    <div className="space-y-3">
      {search ? (
        <p
          aria-live="polite"
          className={cn(
            "text-sm text-muted-foreground tabular-nums",
            PENDING_DIM_CLASS_NAME,
          )}
        >
          {summaries.length} of {pluralize(totalCount, "Cleaner")}
        </p>
      ) : null}
      <ul
        className={cn("grid gap-3 md:hidden", PENDING_DIM_CLASS_NAME)} aria-label="Cleaners"
      >
        {summaries.map((summary) => (
          <li key={summary.cleaner.id}>
            <Link
              href={hrefFor(summary)}
              className={cn(
                "flex min-h-16 w-full cursor-pointer items-start justify-between gap-3 rounded-lg bg-card p-4 shadow-sm ring-1 ring-foreground/10 transition-[background-color,box-shadow] duration-fast active:bg-muted md:hover:ring-foreground/20",
                FOCUS_RING,
                "focus-visible:ring-inset",
              )}
            >
              <div className="min-w-0 space-y-2">
                <p className="text-base font-semibold break-words">
                  {summary.cleaner.full_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pluralize(summary.sessionCount, "session")}
                  {summary.openCount > 0 ? ` · ${summary.openCount} open` : ""}
                </p>
                {summary.flagTotal > 0 ? (
                  <FlagCountBadges counts={summary.flagCounts} isCompact />
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="font-mono text-base font-semibold tabular-nums">
                  {formatMinutes(summary.closedMinutes)}
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

      <div
        className={cn(
          "hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 md:block",
          PENDING_DIM_CLASS_NAME,
        )}
      >
        <Table className="text-sm">
          <caption className="sr-only">Hours per Cleaner, {range.label}</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Cleaner</TableHead>
              <TableHead className="w-24 text-right">Sessions</TableHead>
              <TableHead className="w-28 text-right">Clocked</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summaries.map((summary) => (
              <TableRow
                key={summary.cleaner.id}
                className="group relative cursor-pointer"
              >
                <TableCell className="whitespace-normal">
                  <Link
                    href={hrefFor(summary)}
                    className={cn(
                      "font-medium underline-offset-4 outline-none after:absolute after:inset-0 md:hover:underline",
                      "focus-visible:after:ring-2 focus-visible:after:ring-ring/50 focus-visible:after:ring-inset",
                    )}
                  >
                    {summary.cleaner.full_name}
                  </Link>
                  {summary.openCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {summary.openCount} still open, not counted
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {summary.sessionCount}
                </TableCell>
                <TableCell className="text-right font-mono text-base font-semibold tabular-nums">
                  {formatMinutes(summary.closedMinutes)}
                </TableCell>
                <TableCell className="whitespace-normal">
                  <FlagCountBadges counts={summary.flagCounts} />
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
    </div>
  );
}
