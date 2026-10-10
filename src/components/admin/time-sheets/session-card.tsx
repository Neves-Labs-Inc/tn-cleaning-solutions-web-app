"use client";

import { ArrowRight } from "lucide-react";

import ClockTime from "@/components/admin/time-sheets/clock-time";
import ClockedValue from "@/components/admin/time-sheets/clocked-value";
import SessionBadges from "@/components/admin/time-sheets/session-badges";
import SessionHistory from "@/components/admin/time-sheets/session-history";
import type { SessionRowView } from "@/lib/time-sheets/drilldown-days";

type SessionCardProps = {
  view: SessionRowView;
  isHistoryOpen: boolean;
  onToggleHistory: () => void;
  actions?: React.ReactNode;
};

export default function SessionCard({
  view,
  isHistoryOpen,
  onToggleHistory,
  actions,
}: SessionCardProps): React.ReactNode {
  const historyId = `history-card-${view.id}`;

  return (
    <li className="space-y-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold break-words">
            {view.clientName}
          </p>
          <p className="text-sm break-words text-muted-foreground">
            {view.jobName} ·{" "}
            <span className="whitespace-nowrap font-mono tabular-nums">
              {view.scheduledWindow}
            </span>
          </p>
        </div>
        <p className="shrink-0 text-base font-semibold">
          <ClockedValue minutes={view.clockedMinutes} />
        </p>
      </div>

      <p className="flex flex-wrap items-center gap-1.5 text-sm">
        <ClockTime instant={view.clockIn} />
        <ArrowRight
          className="size-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">to</span>
        <ClockTime instant={view.clockOut} />
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <SessionBadges
          view={view}
          isHistoryOpen={isHistoryOpen}
          onToggleHistory={onToggleHistory}
          historyId={historyId}
        />
      </div>

      {actions ? (
        <div className="flex flex-wrap justify-end gap-2">{actions}</div>
      ) : null}

      {isHistoryOpen ? (
        <div
          id={historyId}
          role="region"
          aria-label={`History for ${view.clientName}`}
          className="animate-in rounded-md bg-muted/40 p-3 duration-base ease-out-quart fade-in-0 slide-in-from-top-1"
        >
          <SessionHistory
            corrections={view.corrections}
            acknowledgements={view.acknowledgements}
          />
        </div>
      ) : null}
    </li>
  );
}
