import Link from "next/link";

import ArrowLinkButton from "@/components/admin/payroll/arrow-link-button";
import { SpecBadge } from "@/components/admin/payroll/payroll-badges";
import { buildTimeSheetsHref } from "@/components/admin/time-sheets/time-sheets-href";
import { Button } from "@/components/ui/button";
import {
  EDITED_BADGE,
  TIME_SHEET_FLAG_SPECS,
} from "@/components/ui/status-badge-tones";
import type { LedgerEntry } from "@/lib/payroll/ledger";

type LedgerEntryMetaProps = {
  entry: LedgerEntry;
  cleanerId: string;
  // A paid run's lines are settled, so nothing links out to fix them.
  isPaid: boolean;
};

// A pay line's badges (Odd duration, Edited) and its way out to fix it: Add Pay rate or
// Acknowledge on Time Sheets. Renders nothing when there's neither.
export default function LedgerEntryMeta({
  entry,
  cleanerId,
  isPaid,
}: LedgerEntryMetaProps): React.ReactNode {
  const hasBadges = entry.isOddDuration || entry.isEdited;
  const canAcknowledge = entry.isOddDuration && !isPaid;
  if (!hasBadges && entry.payRateHref === null) return null;

  return (
    <div className="mt-2 space-y-2">
      {hasBadges ? (
        <div className="flex flex-wrap gap-1">
          {entry.isOddDuration ? (
            <SpecBadge spec={TIME_SHEET_FLAG_SPECS.odd_duration} />
          ) : null}
          {entry.isEdited ? <SpecBadge spec={EDITED_BADGE} /> : null}
        </div>
      ) : null}
      {canAcknowledge ? (
        <Button
          variant="link"
          className="h-auto min-h-11 px-0 transition-colors duration-fast md:min-h-0"
          nativeButton={false}
          render={
            <Link
              href={buildTimeSheetsHref({
                cleaner: cleanerId,
                from: entry.date,
                to: entry.date,
              })}
            />
          }
        >
          Acknowledge on Time Sheets
        </Button>
      ) : null}
      {entry.payRateHref === null ? null : (
        <div>
          <ArrowLinkButton href={entry.payRateHref}>Add Pay rate</ArrowLinkButton>
        </div>
      )}
    </div>
  );
}
