"use client";

import { CheckCircle2, TriangleAlert } from "lucide-react";

import { PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { Button } from "@/components/ui/button";
import type { NeedsCompletionAppointment } from "@/lib/appointments/needs-completion";
import { totalPrices } from "@/lib/appointments/overview";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type NeedsCompletionBarProps = {
  // Any clients' rows; empty hides the bar.
  selected: NeedsCompletionAppointment[];
  onClear: () => void;
  onMarkComplete: () => void;
};

// The floating bar over the Needs completion list. Always mounted so it can animate in and out.
// Its shell mirrors NeedsBillingBar's; keep the two in sync.
export default function NeedsCompletionBar({
  selected,
  onClear,
  onMarkComplete,
}: NeedsCompletionBarProps): React.ReactNode {
  const isOpen = selected.length > 0;
  const total = totalPrices(
    selected.map((appointment) => appointment.priceCents),
  );

  // From lg the admin sidebar (w-68) is visible, so the bar starts at its edge instead of covering it.
  return (
    <div
      inert={!isOpen}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))] shadow-lg backdrop-blur transition-[translate,opacity] lg:left-68",
        isOpen
          ? "translate-y-0 opacity-100 duration-base ease-out-quart"
          : "pointer-events-none translate-y-full opacity-0 duration-[140ms] ease-in-quart",
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex min-w-0 items-start justify-between gap-2 md:flex-1 md:items-center">
          <div className="min-w-0 space-y-0.5">
            <p aria-live="polite" className="flex min-w-0 gap-1 text-sm">
              <span className="shrink-0 font-semibold">
                {selected.length} selected
              </span>
              <span aria-hidden="true">·</span>
              <span className="shrink-0 tabular-nums">
                {formatCents(total.totalCents)}
              </span>
            </p>
            {total.unpricedCount > 0 ? (
              <p className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                <TriangleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span className="min-w-0">
                  {total.unpricedCount} Unpriced, not in the total.
                </span>
              </p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            className={cn(PRESS_CLASS_NAME, "md:hidden")}
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:flex md:shrink-0 md:items-center">
          <Button
            variant="ghost"
            className={cn(PRESS_CLASS_NAME, "hidden md:inline-flex")}
            onClick={onClear}
          >
            Clear
          </Button>
          <Button className={PRESS_CLASS_NAME} onClick={onMarkComplete}>
            <CheckCircle2 aria-hidden="true" />
            Mark complete
          </Button>
        </div>
      </div>
    </div>
  );
}
