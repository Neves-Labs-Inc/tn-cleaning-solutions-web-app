"use client";

import { CalendarClock, Pencil } from "lucide-react";
import { useState } from "react";

import {
  ITEM_META_CLASS_NAME,
  ItemSubRow,
  RowActions,
} from "@/components/admin/detail-page/item-list";
import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/ui/status-badge";
import type { ClientJobPricingRow } from "@/lib/clients/pricing-view";
import { formatDateOnly } from "@/lib/invoices/view";
import { formatRate } from "@/lib/pricing/money";

import RateStateButton from "./rate-state-button";

type RateLineProps = {
  row: ClientJobPricingRow;
  kind: "current" | "scheduled";
  canEdit: boolean;
  onEdit: (row: ClientJobPricingRow) => void;
};

// One rate under its job: the one in force now, or one that starts later.
export default function RateLine({
  row,
  kind,
  canEdit,
  onEdit,
}: RateLineProps): React.ReactNode {
  const [isStatePending, setIsStatePending] = useState(false);
  const date = formatDateOnly(row.effective_from);

  return (
    <ItemSubRow
      actions={
        canEdit ? (
          <RowActions>
            <Button
              variant="outline"
              className={OUTLINE_PRESS_CLASS_NAME}
              disabled={isStatePending}
              onClick={() => onEdit(row)}
              aria-label={`Edit ${row.job_name} rate from ${date}`}
            >
              <Pencil aria-hidden="true" data-icon="inline-start" />
              Edit
            </Button>
            <RateStateButton row={row} onPendingChange={setIsStatePending} />
          </RowActions>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-base font-semibold tabular-nums">
          {formatRate(row.hourly_rate_cents)}
        </p>
        {kind === "scheduled" ? (
          <StatusBadge tone="neutral" icon={CalendarClock}>
            Scheduled
          </StatusBadge>
        ) : null}
      </div>
      <p className={ITEM_META_CLASS_NAME}>
        {kind === "current" ? "since" : "from"} {date}
      </p>
      {row.notes ? (
        <p className={`${ITEM_META_CLASS_NAME} whitespace-pre-line`}>
          {row.notes}
        </p>
      ) : null}
    </ItemSubRow>
  );
}
