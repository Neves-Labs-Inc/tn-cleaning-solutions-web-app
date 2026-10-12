import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  activeStateBadge,
  appointmentCardTone,
  appointmentDisplayBadge,
  appointmentStatusBadge,
  ARCHIVED_BADGE,
  clockStatusBadge,
  invoiceStatusBadge,
  lineStateBadge,
  NOT_CLOCKED_BADGE,
  OVERRIDDEN_BADGE,
  paymentStateBadge,
} from "./status-badge-tones";
import { cn } from "@/lib/utils";

export {
  activeStateBadge,
  appointmentCardTone,
  appointmentDisplayBadge,
  appointmentStatusBadge,
  ARCHIVED_BADGE,
  clockStatusBadge,
  invoiceStatusBadge,
  lineStateBadge,
  NOT_CLOCKED_BADGE,
  OVERRIDDEN_BADGE,
  paymentStateBadge,
};

export type StatusTone = "info" | "success" | "warning" | "danger" | "progress" | "neutral";

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
  progress:
    "border-status-progress-border bg-status-progress text-status-progress-foreground dark:bg-status-progress",
  neutral: "border-border bg-muted text-muted-foreground dark:bg-muted",
};

// Appointment card / list row surface for a tone (DESIGN.md §3.2). Cards never write status-* classes.
export const CARD_TINT_CLASSES: Record<StatusTone, string> = {
  info: "border-status-info-border bg-status-info dark:bg-status-info",
  success: "border-status-success-border bg-status-success dark:bg-status-success",
  warning: "border-status-warning-border bg-status-warning dark:bg-status-warning",
  danger: "border-status-danger-border bg-status-danger dark:bg-status-danger",
  progress: "border-status-progress-border bg-status-progress dark:bg-status-progress",
  neutral: "border-border bg-muted dark:bg-muted", // never returned by appointmentCardTone; kept for a total Record
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
