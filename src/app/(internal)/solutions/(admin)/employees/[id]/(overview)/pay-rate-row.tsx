"use client";

import { CalendarClock, CheckCircle2, Pencil } from "lucide-react";
import { useState } from "react";

import {
  ITEM_META_CLASS_NAME,
  ItemRow,
  RowActions,
} from "@/components/admin/detail-page/item-list";
import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import StatusBadge, { ARCHIVED_BADGE } from "@/components/ui/status-badge";
import type { PayRateKind, PayRateRow } from "@/lib/employees/pay-rates-view";
import { formatDateOnly } from "@/lib/invoices/view";
import { formatRate } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

import PayRateStateButton from "./pay-rate-state-button";

type PayRateRowProps = {
  rate: PayRateRow;
  variant: PayRateKind | "archived";
  onEdit: (rate: PayRateRow) => void;
};

const BADGE_MOTION_CLASS_NAME = "transition-colors duration-base";

function RateBadge({
  variant,
}: {
  variant: PayRateRowProps["variant"];
}): React.ReactNode {
  let badge: React.ReactNode = null;
  if (variant === "current") {
    badge = (
      <StatusBadge
        tone="success"
        icon={CheckCircle2}
        className={BADGE_MOTION_CLASS_NAME}
      >
        Current
      </StatusBadge>
    );
  } else if (variant === "scheduled") {
    badge = (
      <StatusBadge
        tone="neutral"
        icon={CalendarClock}
        className={BADGE_MOTION_CLASS_NAME}
      >
        Scheduled
      </StatusBadge>
    );
  } else if (variant === "archived") {
    badge = (
      <StatusBadge
        tone={ARCHIVED_BADGE.tone}
        className={BADGE_MOTION_CLASS_NAME}
      >
        {ARCHIVED_BADGE.label}
      </StatusBadge>
    );
  }
  return badge;
}

// One of a Cleaner's Pay rates. Live rows edit and archive; an archived row only restores.
export default function PayRateListRow({
  rate,
  variant,
  onEdit,
}: PayRateRowProps): React.ReactNode {
  const [isStatePending, setIsStatePending] = useState(false);
  const date = formatDateOnly(rate.effective_from);
  const isArchived = variant === "archived";

  return (
    <ItemRow
      actions={
        <RowActions>
          {isArchived ? null : (
            <Button
              variant="outline"
              className={OUTLINE_PRESS_CLASS_NAME}
              disabled={isStatePending}
              onClick={() => onEdit(rate)}
              aria-label={`Edit Pay rate from ${date}`}
            >
              <Pencil aria-hidden="true" data-icon="inline-start" />
              Edit
            </Button>
          )}
          <PayRateStateButton rate={rate} onPendingChange={setIsStatePending} />
        </RowActions>
      }
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p
          className={cn(
            "text-base font-semibold tabular-nums",
            isArchived && "text-muted-foreground",
          )}
        >
          {formatRate(rate.hourly_rate_cents)}
        </p>
        <RateBadge variant={variant} />
      </div>
      <p className={ITEM_META_CLASS_NAME}>
        {variant === "current" ? "since" : "from"} {date}
      </p>
    </ItemRow>
  );
}
