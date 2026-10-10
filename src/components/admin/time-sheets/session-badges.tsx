"use client";

import { ChevronDown } from "lucide-react";

import StatusBadge, { type StatusBadgeSpec } from "@/components/ui/status-badge";
import { timeSheetFlagBadges } from "@/components/ui/status-badge-tones";
import type { SessionRowView } from "@/lib/time-sheets/drilldown-days";
import { cn } from "@/lib/utils";

type SessionBadgesProps = {
  view: SessionRowView;
  isHistoryOpen?: boolean;
  onToggleHistory?: () => void;
  historyId?: string;
};

type HistoryToggleProps = {
  badge: StatusBadgeSpec;
  ariaLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  historyId?: string;
};

const EDITED_LABEL = "Edited";
const ACKNOWLEDGED_LABEL = "Odd duration · OK'd";

function HistoryToggle({
  badge,
  ariaLabel,
  isOpen,
  onToggle,
  historyId,
}: HistoryToggleProps): React.ReactNode {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={historyId}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 cursor-pointer items-center rounded-full outline-none md:min-h-0",
        "transition-transform duration-fast active:scale-[0.98] md:hover:[&_[data-tone]]:border-foreground/30",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <StatusBadge tone={badge.tone} icon={badge.icon}>
        <span className="underline decoration-dotted underline-offset-2">
          {badge.label}
        </span>
        <ChevronDown
          className={cn(
            "size-3 transition-transform duration-fast ease-out-quart",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </StatusBadge>
    </button>
  );
}

function getToggleLabel(badge: StatusBadgeSpec, view: SessionRowView, isOpen: boolean): string {
  const action = isOpen ? "hide history" : "show history";
  if (badge.label === ACKNOWLEDGED_LABEL) {
    return `Odd duration acknowledged, ${action}`;
  }

  const count = view.corrections.length;
  if (count === 0) return `Edited, ${action}`;
  return `Edited ${count} ${count === 1 ? "time" : "times"}, ${action}`;
}

// A fragment of pills: the caller supplies the flex wrapper. With onToggleHistory, Edited and
// the OK'd pill open the session's history; without it they are plain pills.
export default function SessionBadges({
  view,
  isHistoryOpen = false,
  onToggleHistory,
  historyId,
}: SessionBadgesProps): React.ReactNode {
  return timeSheetFlagBadges(view).map((badge) => {
    const isToggle =
      onToggleHistory !== undefined &&
      (badge.label === EDITED_LABEL || badge.label === ACKNOWLEDGED_LABEL);

    if (!isToggle) {
      return (
        <StatusBadge key={badge.label} tone={badge.tone} icon={badge.icon}>
          {badge.label}
        </StatusBadge>
      );
    }
    return (
      <HistoryToggle
        key={badge.label}
        badge={badge}
        ariaLabel={getToggleLabel(badge, view, isHistoryOpen)}
        isOpen={isHistoryOpen}
        onToggle={onToggleHistory}
        historyId={historyId}
      />
    );
  });
}
