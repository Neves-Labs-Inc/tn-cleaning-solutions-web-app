"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DraftField } from "@/lib/time-sheets/clock-draft";
import { cn } from "@/lib/utils";

type ClockTimeFieldProps = {
  layout: "row" | "card";
  id: string;
  label: string;
  value: DraftField;
  onChange: (part: keyof DraftField, value: string) => void;
  error?: string;
  hint?: string | null;
  // Row layout: the inputs sit in a table row outside the <form>, so they join it by id.
  formId?: string;
  onKeyDown?: (event: React.KeyboardEvent) => void;
};

const INPUT_MOTION = cn(
  "font-mono tabular-nums md:hover:border-foreground/30",
  "transition-[border-color,box-shadow] duration-fast",
);
const NOTE_MOTION = "animate-in fade-in-0 duration-fast break-words";

export default function ClockTimeField({
  layout,
  id,
  label,
  value,
  onChange,
  error,
  hint,
  formId,
  onKeyDown,
}: ClockTimeFieldProps): React.ReactNode {
  const isRow = layout === "row";
  const noteId = `${id}-note`;
  const hasNote = Boolean(error || hint);

  const timeInput = (
    <Input
      id={id}
      type="time"
      step={60}
      enterKeyHint="next"
      form={formId}
      value={value.time}
      onChange={(event) => onChange("time", event.target.value)}
      onKeyDown={onKeyDown}
      aria-label={isRow ? `${label} time` : undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={hasNote ? noteId : undefined}
      className={cn("min-w-0", INPUT_MOTION, !isRow && "px-2")}
    />
  );
  const dateInput = (
    <Input
      type="date"
      enterKeyHint="next"
      form={formId}
      value={value.date}
      onChange={(event) => onChange("date", event.target.value)}
      onKeyDown={onKeyDown}
      aria-label={`${label} date`}
      aria-invalid={error ? true : undefined}
      aria-describedby={hasNote ? noteId : undefined}
      className={cn(INPUT_MOTION, isRow ? "h-(--control-height-sm)" : "w-36 px-2")}
    />
  );
  // An error replaces the field's hint.
  const errorNote = error ? (
    <FieldError
      id={noteId}
      className={cn(isRow ? "text-xs" : "text-sm", NOTE_MOTION)}
    >
      {error}
    </FieldError>
  ) : null;
  const hintNote =
    hint && !error ? (
      <FieldDescription id={noteId} className="text-xs">
        {hint}
      </FieldDescription>
    ) : null;

  return isRow ? (
    <div className="flex w-32 animate-in flex-col gap-1 duration-fast fade-in-0">
      {timeInput}
      {dateInput}
      {errorNote ?? hintNote}
    </div>
  ) : (
    <Field
      data-invalid={error ? true : undefined}
      className="min-w-0 gap-1.5"
    >
      <FieldLabel htmlFor={id} className="text-sm font-medium">
        {label}
      </FieldLabel>
      {hintNote}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        {timeInput}
        {dateInput}
      </div>
      {errorNote}
    </Field>
  );
}
