import StatusBadge, { type StatusBadgeSpec } from "@/components/ui/status-badge";
import {
  BLOCKED_BADGE,
  FLAG_COUNT_BADGE,
  OFF_CYCLE_BADGE,
  PAY_PERIOD_STATUS_BADGES,
  PAY_RUN_STATUS_BADGES,
} from "@/components/ui/status-badge-tones";
import { pluralize } from "@/lib/payroll/format";
import type {
  PeriodStatusKind,
  RunKind,
  RunStatus,
} from "@/lib/payroll/period-view";

// The Payroll pills. Tones and icons come only from status-badge-tones.ts (DESIGN.md §3.2).

type SpecBadgeProps = {
  spec: StatusBadgeSpec;
  label?: string;
};

export function SpecBadge({ spec, label }: SpecBadgeProps): React.ReactNode {
  return (
    <StatusBadge tone={spec.tone} icon={spec.icon}>
      {label ?? spec.label}
    </StatusBadge>
  );
}

type PeriodStatusBadgeProps = { kind: PeriodStatusKind };

export function PeriodStatusBadge({
  kind,
}: PeriodStatusBadgeProps): React.ReactNode {
  return <SpecBadge spec={PAY_PERIOD_STATUS_BADGES[kind]} />;
}

type RunStatusBadgeProps = { status: RunStatus; kind: RunKind };

// The run's status, plus Off-cycle for an off-cycle run.
export function RunStatusBadge({
  status,
  kind,
}: RunStatusBadgeProps): React.ReactNode {
  return (
    <>
      <SpecBadge spec={PAY_RUN_STATUS_BADGES[status]} />
      {kind === "off_cycle" ? <SpecBadge spec={OFF_CYCLE_BADGE} /> : null}
    </>
  );
}

type BlockedBadgeProps = { label?: string };

export function BlockedBadge({
  label = BLOCKED_BADGE.label,
}: BlockedBadgeProps): React.ReactNode {
  return <SpecBadge spec={BLOCKED_BADGE} label={label} />;
}

type FlagCountBadgeProps = { count: number };

export function FlagCountBadge({ count }: FlagCountBadgeProps): React.ReactNode {
  if (count === 0) return null;

  return <SpecBadge spec={FLAG_COUNT_BADGE} label={pluralize(count, "flag")} />;
}
