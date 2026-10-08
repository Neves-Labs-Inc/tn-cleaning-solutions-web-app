import { CheckCircle2, Clock, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/lib/helpers/dashboard";
import { formatBusinessTime } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export type StatusTone = "info" | "success" | "warning" | "danger" | "neutral";

export type ClockStatus = "not_started" | "clocked_in" | "clocked_out";

export type StatusBadgeSpec = {
  tone: StatusTone;
  label: string;
  icon?: LucideIcon;
};

type StatusBadgeProps = {
  tone: StatusTone;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
};

// The only place in the app that paints status colors (DESIGN.md §3.2, §10).
// The dark:bg-* entries replace Badge's outline `dark:bg-input/30` via cn().
const TONE_CLASSES: Record<StatusTone, string> = {
  info: "border-status-info-border bg-status-info text-status-info-foreground dark:bg-status-info",
  success:
    "border-status-success-border bg-status-success text-status-success-foreground dark:bg-status-success",
  warning:
    "border-status-warning-border bg-status-warning text-status-warning-foreground dark:bg-status-warning",
  danger:
    "border-status-danger-border bg-status-danger text-status-danger-foreground dark:bg-status-danger",
  neutral: "border-border bg-muted text-muted-foreground dark:bg-muted",
};

export default function StatusBadge({
  tone,
  icon: Icon,
  className,
  children,
}: StatusBadgeProps): React.ReactNode {
  return (
    <Badge
      variant="outline"
      data-tone={tone}
      className={cn(
        "gap-1 font-medium tracking-tight transition-colors duration-base",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </Badge>
  );
}

export function appointmentStatusBadge(
  status: AppointmentStatus,
): StatusBadgeSpec {
  const specs: Record<AppointmentStatus, StatusBadgeSpec> = {
    scheduled: { tone: "info", label: "Scheduled" },
    in_progress: { tone: "success", label: "In Progress" },
    completed: { tone: "neutral", label: "Completed" },
    cancelled: { tone: "danger", label: "Cancelled" },
  };
  return specs[status];
}

export function clockStatusBadge(
  status: ClockStatus,
  clockedInAt: string | null,
  clockedOutAt: string | null,
): StatusBadgeSpec {
  const specs: Record<ClockStatus, StatusBadgeSpec> = {
    not_started: { tone: "warning", label: "Not started", icon: Clock },
    clocked_in: {
      tone: "success",
      label: clockedInAt
        ? `Clocked in at ${formatBusinessTime(new Date(clockedInAt))}`
        : "Clocked in",
      icon: CheckCircle2,
    },
    clocked_out: {
      tone: "neutral",
      label: clockedOutAt
        ? `Clocked out at ${formatBusinessTime(new Date(clockedOutAt))}`
        : "Clocked out",
    },
  };
  return specs[status];
}
