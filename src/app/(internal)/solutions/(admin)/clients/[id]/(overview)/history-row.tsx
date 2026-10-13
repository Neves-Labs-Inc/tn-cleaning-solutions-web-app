"use client";

import { useState } from "react";

import {
  ITEM_META_CLASS_NAME,
  ITEM_PRIMARY_CLASS_NAME,
  ItemRow,
  RowActions,
} from "@/components/admin/detail-page/item-list";
import StatusBadge, { ARCHIVED_BADGE } from "@/components/ui/status-badge";
import type { PricingHistoryRow } from "@/lib/clients/pricing-view";
import { formatDateOnly } from "@/lib/invoices/view";
import { formatRate } from "@/lib/pricing/money";

import RateStateButton from "./rate-state-button";

type HistoryRowProps = {
  row: PricingHistoryRow;
  canEdit: boolean;
};

// A rate no longer in force: superseded by a newer one, or archived.
export default function HistoryRow({
  row,
  canEdit,
}: HistoryRowProps): React.ReactNode {
  // History rows have no Edit to disable; the button shows its own pending state.
  const [, setIsStatePending] = useState(false);
  const label = row.status === "Archived" ? ARCHIVED_BADGE.label : "Superseded";

  return (
    <ItemRow
      actions={
        canEdit ? (
          <RowActions>
            <RateStateButton row={row} onPendingChange={setIsStatePending} />
          </RowActions>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className={ITEM_PRIMARY_CLASS_NAME}>{row.job_name}</p>
        <StatusBadge tone="neutral">{label}</StatusBadge>
      </div>
      <p className={ITEM_META_CLASS_NAME}>
        <span className="tabular-nums">
          {formatRate(row.hourly_rate_cents)}
        </span>
        {` · from ${formatDateOnly(row.effective_from)}`}
      </p>
      {row.notes ? (
        <p className={`${ITEM_META_CLASS_NAME} whitespace-pre-line`}>
          {row.notes}
        </p>
      ) : null}
    </ItemRow>
  );
}
