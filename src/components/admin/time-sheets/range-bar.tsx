"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";

import { buildTimeSheetsHref } from "@/components/admin/time-sheets/time-sheets-href";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getBusinessDate } from "@/lib/schedule/business-time";
import type { WeekRange } from "@/lib/time-sheets/range";
import { cn } from "@/lib/utils";

type RangeBarProps = {
  range: WeekRange;
  cleanerId?: string;
};

type InvalidField = "from" | "to";
type RangeError = { message: string; fields: InvalidField[] };

const FORM_ID = "time-sheets-custom-range";
const ERROR_ID = "time-sheets-custom-range-error";
const ORDER_ERROR = "Pick a start date on or before the end date";
const FUTURE_ERROR = "Start date can't be in the future";

// Both are yyyy-MM-dd, so string order is date order.
function validateRange(
  from: string,
  to: string,
  today: string,
): RangeError | null {
  if (!from || !to || from > to) {
    return { message: ORDER_ERROR, fields: ["from", "to"] };
  }
  if (from > today) return { message: FUTURE_ERROR, fields: ["from"] };
  return null;
}

export default function RangeBar({
  range,
  cleanerId,
}: RangeBarProps): React.ReactNode {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [error, setError] = useState<RangeError | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFormOpen) fromRef.current?.focus();
  }, [isFormOpen]);

  useEffect(() => {
    if (!error) return;
    const first = error.fields[0] === "from" ? fromRef.current : toRef.current;
    first?.focus();
  }, [error]);

  function navigate(parts: { from?: string; to?: string }) {
    startTransition(() => {
      router.push(buildTimeSheetsHref({ ...parts, cleaner: cleanerId }));
    });
  }

  function closeForm() {
    setIsFormOpen(false);
    setError(null);
  }

  function handleToggle() {
    if (isFormOpen) closeForm();
    else setIsFormOpen(true);
  }

  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape") return;
    closeForm();
    toggleRef.current?.focus();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from") ?? "");
    const to = String(data.get("to") ?? "");

    const problem = validateRange(from, to, getBusinessDate(new Date()));
    setError(problem);
    if (problem) return;

    closeForm();
    navigate({ from, to });
  }

  const isInvalid = (field: InvalidField) =>
    error?.fields.includes(field) ?? false;

  return (
    <div className="space-y-2" aria-busy={isPending}>
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous period"
            className="active:scale-[0.98]"
            onClick={() => navigate(range.prev)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p
            aria-live="polite"
            className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums md:min-w-44 md:flex-none"
          >
            {range.label}
          </p>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next period"
            className="active:scale-[0.98]"
            disabled={range.next === null}
            onClick={() => range.next && navigate(range.next)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Button
            variant="outline"
            className="active:scale-[0.98]"
            disabled={range.isThisWeek}
            onClick={() => navigate({})}
          >
            This week
          </Button>
          <Button
            ref={toggleRef}
            variant={range.isWeek ? "ghost" : "secondary"}
            aria-expanded={isFormOpen}
            aria-controls={FORM_ID}
            onClick={handleToggle}
          >
            <CalendarRange aria-hidden="true" />
            Custom range
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {range.isWeek
          ? "Week runs Mon–Sun."
          : "Custom range. Arrows step by its length."}
      </p>

      {isFormOpen ? (
        <form
          id={FORM_ID}
          noValidate
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
          className={cn(
            "grid max-w-md grid-cols-2 gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:grid-cols-[1fr_1fr_auto] sm:items-end",
            "animate-in duration-base ease-out-quart fade-in-0 slide-in-from-top-1",
          )}
        >
          <Field>
            <FieldLabel htmlFor="time-sheets-from">From</FieldLabel>
            <Input
              ref={fromRef}
              id="time-sheets-from"
              name="from"
              type="date"
              defaultValue={range.from}
              max={getBusinessDate(new Date())}
              aria-invalid={isInvalid("from")}
              aria-describedby={isInvalid("from") ? ERROR_ID : undefined}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="time-sheets-to">To</FieldLabel>
            <Input
              ref={toRef}
              id="time-sheets-to"
              name="to"
              type="date"
              defaultValue={range.to}
              aria-invalid={isInvalid("to")}
              aria-describedby={isInvalid("to") ? ERROR_ID : undefined}
            />
          </Field>
          {error ? (
            <p
              id={ERROR_ID}
              role="alert"
              className="col-span-2 text-sm text-destructive sm:order-last sm:col-span-3"
            >
              {error.message}
            </p>
          ) : null}
          <Button type="submit" className="col-span-2 sm:col-span-1">
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );
}
