"use client";

import ClockTime from "@/components/admin/time-sheets/clock-time";
import ClockedValue from "@/components/admin/time-sheets/clocked-value";
import SessionBadges from "@/components/admin/time-sheets/session-badges";
import SessionHistory from "@/components/admin/time-sheets/session-history";
import { TableCell, TableRow } from "@/components/ui/table";
import type { SessionRowView } from "@/lib/time-sheets/drilldown-days";
import { cn } from "@/lib/utils";

type SessionTableRowsProps = {
  view: SessionRowView;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  actions?: React.ReactNode;
  // An open inline panel (fix or acknowledge), shown in a full-width row under the session.
  panel?: React.ReactNode;
};

export const SESSION_TABLE_COLUMNS = 7;

// The row plus, while history is open, the full-width panel row under it.
export default function SessionTableRows({
  view,
  isHistoryOpen,
  onToggleHistory,
  actions,
  panel,
}: SessionTableRowsProps): React.ReactNode {
  const historyId = `history-row-${view.id}`;

  return (
    <>
      <TableRow
        className={cn(
          // The base row tints any row holding an aria-expanded button; only an open one should.
          "has-aria-expanded:bg-transparent",
          (isHistoryOpen || panel) &&
            "bg-muted/40 has-aria-expanded:bg-muted/40",
        )}
      >
        <TableCell className="px-4 align-top whitespace-normal">
          <p className="font-medium break-words">{view.clientName}</p>
          <p className="text-muted-foreground">{view.jobName}</p>
        </TableCell>
        <TableCell className="align-top font-mono tabular-nums">
          {view.scheduledWindow}
        </TableCell>
        <TableCell className="align-top">
          <ClockTime instant={view.clockIn} />
        </TableCell>
        <TableCell className="align-top">
          <ClockTime instant={view.clockOut} />
        </TableCell>
        <TableCell className="align-top font-semibold">
          <ClockedValue minutes={view.clockedMinutes} />
        </TableCell>
        <TableCell className="min-w-48 align-top whitespace-normal">
          <div className="flex flex-wrap items-center gap-1.5">
            <SessionBadges
              view={view}
              isHistoryOpen={isHistoryOpen}
              onToggleHistory={onToggleHistory}
              historyId={historyId}
            />
          </div>
        </TableCell>
        <TableCell className="px-4 text-right align-top whitespace-nowrap">
          {actions}
        </TableCell>
      </TableRow>
      {isHistoryOpen ? (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell
            colSpan={SESSION_TABLE_COLUMNS}
            className="px-4 pb-4 whitespace-normal"
          >
            <div
              id={historyId}
              role="region"
              aria-label={`History for ${view.clientName}`}
              className="max-w-xl animate-in duration-base ease-out-quart fade-in-0 slide-in-from-top-1"
            >
              <SessionHistory
                corrections={view.corrections}
                acknowledgements={view.acknowledgements}
              />
            </div>
          </TableCell>
        </TableRow>
      ) : null}
      {panel ? (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell
            colSpan={SESSION_TABLE_COLUMNS}
            className="px-4 pt-3 pb-4 whitespace-normal"
          >
            <div className="max-w-xl">{panel}</div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
