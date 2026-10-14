"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import AdjustmentForm from "@/components/admin/payroll/adjustment-form";
import AdjustmentRow from "@/components/admin/payroll/adjustment-row";
import { Button } from "@/components/ui/button";
import type { LedgerEntry } from "@/lib/payroll/ledger";
import type { PeriodRun, RunAdjustment } from "@/lib/payroll/period-view";
import { cn } from "@/lib/utils";

type AdjustmentSectionProps = {
  run: PeriodRun;
  // The run's own Adjustments (about the whole run, or not on one of its lines).
  adjustments: RunAdjustment[];
  lines: LedgerEntry[];
  periodStart: string;
  // See getAdjustmentAccess: Add shows on the run new Adjustments land on; Delete on any unpaid run.
  canAdd: boolean;
  canDelete: boolean;
  isFormInitiallyOpen: boolean;
};

const EYEBROW_CLASS_NAME =
  "text-xs font-semibold tracking-wider text-muted-foreground uppercase";
const EMPTY_TEXT = "None. Tips, gas, expenses and fixes go here.";
// A regular run while the Cleaner has an unpaid off-cycle run: add_pay_adjustment targets that.
const OFF_CYCLE_NOTE = "New Adjustments go on her off-cycle run.";

// "Adjustments for the run": the run-level lines and, on an editable run, Add Adjustment.
export default function AdjustmentSection({
  run,
  adjustments,
  lines,
  periodStart,
  canAdd,
  canDelete,
  isFormInitiallyOpen,
}: AdjustmentSectionProps): React.ReactNode {
  const [isFormOpen, setIsFormOpen] = useState(isFormInitiallyOpen);
  const [formKey, setFormKey] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // Set by the admin's own open or close, so the form opened by Add Cleaner takes no focus.
  const shouldMoveFocusRef = useRef(false);

  // After the commit that swaps the Add button and the form: the button that opened the form
  // unmounts, so focus moves to Amount; on close it goes back to the Add button.
  useEffect(() => {
    if (!shouldMoveFocusRef.current) return;

    shouldMoveFocusRef.current = false;
    const amount = sectionRef.current?.querySelector<HTMLInputElement>(
      'input[name="amount"]',
    );
    const target = isFormOpen ? amount : addButtonRef.current;
    target?.focus();
  }, [isFormOpen]);

  function handleOpen(): void {
    shouldMoveFocusRef.current = true;
    setIsFormOpen(true);
  }

  function handleDone(): void {
    shouldMoveFocusRef.current = true;
    setIsFormOpen(false);
    setFormKey((current) => current + 1);
  }

  if (!canDelete && adjustments.length === 0) return null;

  return (
    <section
      ref={sectionRef}
      className="rounded-lg bg-card p-3 ring-1 ring-foreground/10"
    >
      <div className="flex min-h-9 items-center justify-between gap-2">
        {/* Shortened in a narrow ledger so it doesn't wrap beside Add Adjustment. */}
        <h3 className={EYEBROW_CLASS_NAME}>
          Adjustments<span className="hidden @md:inline"> for the run</span>
        </h3>
        {canAdd && !isFormOpen ? (
          <Button
            ref={addButtonRef}
            type="button"
            variant="ghost"
            className={OUTLINE_PRESS_CLASS_NAME}
            onClick={handleOpen}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            Add Adjustment
          </Button>
        ) : null}
      </div>
      {canDelete && !canAdd ? (
        <p className="text-sm text-muted-foreground">{OFF_CYCLE_NOTE}</p>
      ) : null}
      {adjustments.length === 0 && canAdd ? (
        <p className="text-sm text-muted-foreground">{EMPTY_TEXT}</p>
      ) : null}
      {adjustments.length === 0 ? null : (
        <div className="divide-y">
          {adjustments.map((item) => (
            <AdjustmentRow
              key={item.id}
              adjustment={item}
              showsAppointment
              isDeletable={canDelete}
            />
          ))}
        </div>
      )}
      {canAdd ? (
        // §13 collapse: rows 0fr -> 1fr, with the content fading in over it.
        <div
          className={cn(
            "grid transition-[grid-template-rows] motion-reduce:transition-none",
            isFormOpen
              ? "grid-rows-[1fr] duration-base ease-out-quart"
              : "grid-rows-[0fr] duration-[140ms] ease-in-quart",
          )}
        >
          <div
            inert={!isFormOpen}
            className={cn(
              "min-h-0 overflow-hidden transition-opacity",
              isFormOpen
                ? "opacity-100 duration-base ease-out-quart"
                : "opacity-0 duration-[140ms] ease-in-quart",
            )}
          >
            <div className="pt-3">
              {/* Stays mounted so it can animate out; a new key clears it for next time. */}
              <AdjustmentForm
                key={formKey}
                employeeId={run.cleaner.id}
                cleanerName={run.cleaner.name}
                periodStart={periodStart}
                lines={lines}
                onDone={handleDone}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
