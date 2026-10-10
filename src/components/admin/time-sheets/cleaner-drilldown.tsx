"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarX2 } from "lucide-react";

import AcknowledgeButton, {
  ACKNOWLEDGE_BUTTON_ATTRIBUTE,
} from "@/components/admin/time-sheets/acknowledge-button";
import AcknowledgePanel from "@/components/admin/time-sheets/acknowledge-panel";
import ClockCorrectionForm, {
  type ReadOnlyCells,
} from "@/components/admin/time-sheets/clock-correction-form";
import ClockFixButton from "@/components/admin/time-sheets/clock-fix-button";
import { formatMinutes } from "@/components/admin/time-sheets/format-minutes";
import RangeBar from "@/components/admin/time-sheets/range-bar";
import SessionCard from "@/components/admin/time-sheets/session-card";
import {
  getFixButtonId,
  getFixPanelId,
  getSessionFocusId,
  type SessionLayout,
} from "@/components/admin/time-sheets/session-panel-ids";
import SessionRowActions from "@/components/admin/time-sheets/session-row-actions";
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

type PanelKind = "history" | "ack" | "fix";
type OpenPanel = { sessionId: string; kind: PanelKind } | null;
type FocusTarget = { sessionId: string; layout: SessionLayout };

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
  const focusAfterFix = useRef<FocusTarget | null>(null);

  const isPanelOpen = (sessionId: string, kind: PanelKind) =>
    openPanel?.sessionId === sessionId && openPanel.kind === kind;

  // Opening one session's panel replaces any other; the same toggle closes it.
  const togglePanel = (sessionId: string, kind: PanelKind) =>
    setOpenPanel((current) =>
      current?.sessionId === sessionId && current.kind === kind
        ? null
        : { sessionId, kind },
    );

  const isAckOpen = (view: SessionRowView) =>
    isPanelOpen(view.id, "ack") &&
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

  // Same rule as closeAck: a fix save resolving after the admin moved on leaves the new panel.
  const closeFix = (target: FocusTarget) =>
    setOpenPanel((current) => {
      const isOwn =
        current?.sessionId === target.sessionId && current.kind === "fix";
      if (!isOwn) return current;

      focusAfterFix.current = target;
      return null;
    });

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

  // After a fix panel closes, focus returns to its button, or to the session when none remains.
  useEffect(() => {
    const target = focusAfterFix.current;
    if (!target || openPanel !== null) return;

    focusAfterFix.current = null;
    const { sessionId, layout } = target;
    const element =
      document.getElementById(getFixButtonId(sessionId, layout)) ??
      document.getElementById(getSessionFocusId(sessionId, layout));
    element?.focus();
  }, [openPanel]);

  // Acknowledge first, then the fix button, so the fix button stays rightmost.
  const renderActions = (view: SessionRowView, layout: SessionLayout) => (
    <SessionRowActions layout={layout}>
      <AcknowledgeButton
        layout={layout}
        view={view}
        isOpen={isAckOpen(view)}
        onOpen={() => openAck(view.id)}
      />
      <ClockFixButton
        view={view}
        layout={layout}
        id={getFixButtonId(view.id, layout)}
        expanded={isPanelOpen(view.id, "fix")}
        controlsId={getFixPanelId(view.id, layout)}
        onOpen={() => togglePanel(view.id, "fix")}
      />
    </SessionRowActions>
  );

  const renderAckPanel = (view: SessionRowView) =>
    isAckOpen(view) ? (
      <AcknowledgePanel
        view={view}
        onClose={() => closeAck(view.id)}
        onCancel={() => cancelAck(view.id)}
      />
    ) : undefined;

  const renderCardPanel = (view: SessionRowView) =>
    isPanelOpen(view.id, "fix") && view.fixAction ? (
      <ClockCorrectionForm
        layout="card"
        view={view}
        mode={view.fixAction}
        id={getFixPanelId(view.id, "card")}
        onClose={() => closeFix({ sessionId: view.id, layout: "card" })}
      />
    ) : (
      renderAckPanel(view)
    );

  const getRowEditor = (view: SessionRowView) => {
    const { fixAction } = view;
    if (!isPanelOpen(view.id, "fix") || !fixAction) return undefined;

    return function RowEditor(cells: ReadOnlyCells): React.ReactNode {
      return (
        <ClockCorrectionForm
          layout="row"
          cells={cells}
          view={view}
          mode={fixAction}
          id={getFixPanelId(view.id, "row")}
          onClose={() => closeFix({ sessionId: view.id, layout: "row" })}
        />
      );
    };
  };

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
                      isHistoryOpen={isPanelOpen(view.id, "history")}
                      onToggleHistory={() => togglePanel(view.id, "history")}
                      actions={renderActions(view, "card")}
                      panel={renderCardPanel(view)}
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
                      isHistoryOpen={isPanelOpen(view.id, "history")}
                      onToggleHistory={() => togglePanel(view.id, "history")}
                      actions={renderActions(view, "row")}
                      panel={renderAckPanel(view)}
                      renderEditor={getRowEditor(view)}
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
