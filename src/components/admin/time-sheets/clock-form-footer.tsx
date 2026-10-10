"use client";

import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ClockCorrection } from "@/hooks/use-clock-correction";
import { MAX_CLOCK_TEXT_LENGTH } from "@/lib/time-sheets/clock-draft";
import { cn } from "@/lib/utils";

type ClockFormFooterProps = {
  correction: ClockCorrection;
  layout: "row" | "card";
};

type PendingSubmitProps = {
  label: string;
  isPending: boolean;
  className?: string;
};

const CLEARED_HINT =
  "Saving clears both clocks. The session goes back to Missing clock.";
const REASON_PLACEHOLDER = "e.g. Forgot to clock out";
export const PRESS_FEEDBACK =
  "transition-[background-color,transform,box-shadow] duration-fast active:scale-[0.98]";

// Both labels share one grid cell, so the button keeps its width while the spinner shows.
function PendingSubmit({
  label,
  isPending,
  className,
}: PendingSubmitProps): React.ReactNode {
  return (
    <Button
      type="submit"
      disabled={isPending}
      aria-busy={isPending}
      className={cn(PRESS_FEEDBACK, "md:hover:bg-primary/90", className)}
    >
      <span className="grid [&>*]:col-start-1 [&>*]:row-start-1">
        <span
          aria-hidden={!isPending}
          className={cn(
            "inline-flex items-center justify-center gap-2",
            isPending ? "visible" : "invisible",
          )}
        >
          <Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
          {label}
        </span>
        <span
          aria-hidden={isPending}
          className={isPending ? "invisible" : "visible"}
        >
          {label}
        </span>
      </span>
    </Button>
  );
}

export default function ClockFormFooter({
  correction,
  layout,
}: ClockFormFooterProps): React.ReactNode {
  const { mode, ids, errors, isPending, isCleared } = correction;
  const isRow = layout === "row";
  const isCard = !isRow;

  return (
    <>
      {isRow && correction.prefillHint ? (
        <p className="basis-full text-xs text-muted-foreground">
          {correction.prefillHint}
        </p>
      ) : null}

      <Field className={cn("min-w-0 gap-1.5", isRow && "w-80")}>
        <FieldLabel htmlFor={ids.reason} className="text-sm font-medium">
          Reason (optional)
        </FieldLabel>
        <Input
          id={ids.reason}
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={MAX_CLOCK_TEXT_LENGTH}
          placeholder={REASON_PLACEHOLDER}
          value={correction.reason}
          onChange={(event) => correction.changeReason(event.target.value)}
          className={cn(
            "md:hover:border-foreground/30",
            "transition-[border-color,box-shadow] duration-fast",
            isRow && "h-(--control-height-sm)",
          )}
        />
      </Field>

      {/* Always mounted, so screen readers announce the hint when it appears. */}
      <p
        aria-live="polite"
        className={cn(
          isCleared ? "text-sm text-muted-foreground" : "sr-only",
          isRow && isCleared && "basis-full",
        )}
      >
        {isCleared ? CLEARED_HINT : null}
      </p>

      {errors.form ? (
        <Alert
          id={ids.alert}
          variant="destructive"
          tabIndex={-1}
          className={cn(
            "animate-in duration-fast fade-in-0 outline-none",
            isRow && "basis-full",
          )}
        >
          <CircleAlert aria-hidden="true" />
          <AlertDescription className="break-words">
            {errors.form}
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "flex min-w-0 flex-wrap gap-2",
          isCard && "mt-2",
          isRow && "flex-1 items-end",
        )}
      >
        <PendingSubmit
          label={correction.submitLabel}
          isPending={isPending}
          className={cn(isCard && "min-w-0 flex-1 md:flex-none")}
        />
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={correction.cancel}
          className={cn(
            PRESS_FEEDBACK,
            "active:bg-muted md:hover:bg-muted",
            isCard && "min-w-0 flex-1 md:flex-none",
          )}
        >
          Cancel
        </Button>
        {mode === "edit" ? (
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={correction.clear}
            className={cn(
              PRESS_FEEDBACK,
              // Overrides the ghost hover so a tap on a phone leaves no fill.
              "text-destructive hover:bg-transparent hover:text-destructive md:hover:bg-destructive/10",
              "focus-visible:ring-destructive/20",
              isCard && "basis-full justify-start sm:basis-auto",
              isRow && "ml-auto",
            )}
          >
            Clear clocks
          </Button>
        ) : null}
      </div>
    </>
  );
}
