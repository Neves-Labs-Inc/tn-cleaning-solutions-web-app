import { formatSignedCents } from "@/lib/payroll/format";
import type { RunAdjustment } from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type AdjustmentRowProps = {
  adjustment: RunAdjustment;
  // In the run box, an Adjustment that points at an appointment names it.
  showsAppointment?: boolean;
};

// A ↳ line under a pay line or in the run's Adjustments box.
export default function AdjustmentRow({
  adjustment,
  showsAppointment = false,
}: AdjustmentRowProps): React.ReactNode {
  const isNegative = adjustment.amountCents < 0;

  return (
    <div className="flex items-start gap-2 py-1.5 pl-4 text-sm">
      <span aria-hidden="true" className="text-muted-foreground">
        ↳
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Adjustment</p>
        <p className="text-xs break-words text-muted-foreground">
          {adjustment.reason}
          {showsAppointment && adjustment.appointmentLabel !== null
            ? ` · ${adjustment.appointmentLabel}`
            : ""}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 font-mono tabular-nums",
          isNegative && "text-destructive",
        )}
      >
        {/* Screen readers skip the U+2212 sign, so a deduction says "minus". */}
        <span aria-hidden={isNegative || undefined}>
          {formatSignedCents(adjustment.amountCents)}
        </span>
        {isNegative ? (
          <span className="sr-only">
            minus {formatCents(-adjustment.amountCents)}
          </span>
        ) : null}
      </span>
    </div>
  );
}
