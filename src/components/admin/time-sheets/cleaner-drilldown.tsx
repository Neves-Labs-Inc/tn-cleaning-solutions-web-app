"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarX2 } from "lucide-react";

import AcknowledgeButton, {
  ACKNOWLEDGE_BUTTON_ATTRIBUTE,
} from "@/components/admin/time-sheets/acknowledge-button";
import AcknowledgePanel from "@/components/admin/time-sheets/acknowledge-panel";
import SessionRowActions from "@/components/admin/time-sheets/session-row-actions";
import { formatMinutes } from "@/components/admin/time-sheets/format-minutes";
import RangeBar from "@/components/admin/time-sheets/range-bar";
import SessionCard from "@/components/admin/time-sheets/session-card";
import SessionTableRows, {
  SESSION_TABLE_COLUMNS,
} from "@/components/admin/time-sheets/session-table-rows";
import { buildTimeSheetsHref } from "@/components/admin/time-sheets/time-sheets-href";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import PageHeader from "@/components/ui/page-header";
import StatTile from "@/components/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  DrilldownDay,
  SessionRowView,
} from "@/lib/time-sheets/drilldown-days";
import type { WeekRange } from "@/lib/time-sheets/range";
import type { CleanerSummary } from "@/lib/time-sheets/summaries";
import { cn } from "@/lib/utils";

type CleanerDrilldownProps = {
  cleaner: { id: string; full_name: string };
  summary: Pick<
    CleanerSummary,
    "closedMinutes" | "sessionCount" | "openCount" | "flagTotal"
  >;
  days: DrilldownDay[];
  range: WeekRange;
};

// Ticket 07 adds "fix" to this union.
type OpenPanel = { sessionId: string; kind: "history" | "ack" } | null;

const EYEBROW =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export default function CleanerDrilldown({
  cleaner,
  summary,
  days,
  range,
}: CleanerDrilldownProps): React.ReactNode {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const focusReturnId = useRef<string | null>(null);

  const isHistoryOpen = (sessionId: string) =>
    openPanel?.sessionId === sessionId && openPanel.kind === "history";

  // Opening one session's panel replaces any other; the same toggle closes it.
  const toggleHistory = (sessionId: string) =>
    setOpenPanel((current) =>
      current?.sessionId === sessionId && current.kind === "history"
        ? null
        : { sessionId, kind: "history" },
    );

  const isAckOpen = (view: SessionRowView) =>
    openPanel?.sessionId === view.id &&
    openPanel.kind === "ack" &&
    // A refresh that clears the flag also drops the panel.
    view.flags.includes("odd_duration");

  const openAck = (sessionId: string) =>
    setOpenPanel({ sessionId, kind: "ack" });

  // A save that resolves after another panel opened must not close that one.
  const closeAck = (sessionId: string) =>
    setOpenPanel((current) =>
      current?.sessionId === sessionId && current.kind === "ack"
        ? null
        : current,
    );

  const cancelAck = (sessionId: string) => {
    setOpenPanel(null);
    focusReturnId.current = sessionId;
  };

  // The card and the table row both render; focus the copy that is actually visible.
  useEffect(() => {
    const sessionId = focusReturnId.current;
    if (!sessionId) return;
    focusReturnId.current = null;
    const buttons = document.querySelectorAll<HTMLElement>(
      `[${ACKNOWLEDGE_BUTTON_ATTRIBUTE}="${sessionId}"]`,
    );
    Array.from(buttons)
      .find((button) => button.offsetParent !== null)
      ?.focus();
  }, [openPanel]);

  // Acknowledge first, then ticket 07's fix button, so the fix button stays rightmost.
  const renderActions = (view: SessionRowView, layout: "table" | "card") => (
    <SessionRowActions layout={layout}>
      <AcknowledgeButton
        view={view}
        isOpen={isAckOpen(view)}
        onOpen={() => openAck(view.id)}
      />
    </SessionRowActions>
  );

  const renderPanel = (view: SessionRowView) =>
    isAckOpen(view) ? (
      <AcknowledgePanel
        view={view}
        onClose={() => closeAck(view.id)}
        onCancel={() => cancelAck(view.id)}
      />
    ) : undefined;

  return (
    <div className="animate-in space-y-6 fade-in-0 duration-slow lg:space-y-8">
      <div className="space-y-2">
        <Link
          href={buildTimeSheetsHref({ from: range.from, to: range.to })}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "-ml-3 cursor-pointer gap-1.5",
          )}
        >
          <ArrowLeft aria-hidden="true" />
          All cleaners
        </Link>
        <PageHeader title={cleaner.full_name} />
      </div>

      <RangeBar range={range} cleanerId={cleaner.id} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Clocked"
          value={formatMinutes(summary.closedMinutes)}
          caption={
            summary.openCount > 0
              ? `${summary.openCount} open, not counted`
              : undefined
          }
          fitValue
          className="col-span-2 sm:col-span-1"
        />
        <StatTile label="Sessions" value={String(summary.sessionCount)} fitValue />
        <StatTile label="Flags" value={String(summary.flagTotal)} fitValue />
      </div>

      {days.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarX2 aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No sessions in this range.</EmptyTitle>
            <EmptyDescription>
              Step to another week or pick a custom range.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="space-y-6 xl:hidden">
            {days.map((day) => (
              <section key={day.date} className="space-y-2">
                <h3
                  className={cn(
                    "sticky top-16 z-10 bg-background py-2 lg:top-0",
                    EYEBROW,
                  )}
                >
                  {day.label}
                </h3>
                <ul className="divide-y rounded-lg bg-card ring-1 ring-foreground/10">
                  {day.sessions.map((view) => (
                    <SessionCard
                      key={view.id}
                      view={view}
                      isHistoryOpen={isHistoryOpen(view.id)}
                      onToggleHistory={() => toggleHistory(view.id)}
                      actions={renderActions(view, "card")}
                      panel={renderPanel(view)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10 xl:block">
            <Table className="text-sm">
              <caption className="sr-only">
                Sessions for {cleaner.full_name}, {range.label}
              </caption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Visit</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Clocked</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="px-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              {days.map((day) => (
                <TableBody key={day.date}>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableCell
                      colSpan={SESSION_TABLE_COLUMNS}
                      className={cn("px-4 py-1.5", EYEBROW)}
                    >
                      {day.label}
                    </TableCell>
                  </TableRow>
                  {day.sessions.map((view) => (
                    <SessionTableRows
                      key={view.id}
                      view={view}
                      isHistoryOpen={isHistoryOpen(view.id)}
                      onToggleHistory={() => toggleHistory(view.id)}
                      actions={renderActions(view, "table")}
                      panel={renderPanel(view)}
                    />
                  ))}
                </TableBody>
              ))}
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
