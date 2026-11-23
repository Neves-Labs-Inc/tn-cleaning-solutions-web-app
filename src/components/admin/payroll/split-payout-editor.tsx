"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, Plus, X } from "lucide-react";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
import { PayoutMethodInput } from "@/components/admin/payroll/payout-method-input";
import {
  ERROR_MOTION_CLASS,
  INPUT_HOVER_CLASS,
} from "@/components/admin/payroll/payout-sheet-classes";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  partRowErrors,
  splitSumLineFor,
  type PartDraft,
  type PartRowError,
} from "@/lib/payroll/mark-paid";
import { cn } from "@/lib/utils";

// The remove button only shows above this many rows: a split never drops below two.
const MIN_PARTS = 2;

type SplitPayoutEditorProps = {
  // Prefix for every id in the editor; also what splitDescribedBy and splitRefusalId read.
  idPrefix: string;
  parts: PartDraft[];
  totalCents: number;
  isPending: boolean;
  // A server split refusal, shown under the rows and above the live line.
  refusal: string | null;
  // Focus Part 1's amount when the editor mounts (it was just opened by the Split payout link).
  shouldFocusOnMount: boolean;
  onChange: (parts: PartDraft[]) => void;
  onUseOneMethod: () => void;
};

type SplitPayoutLinkProps = {
  isPending: boolean;
  onClick: () => void;
};

function methodId(idPrefix: string, index: number): string {
  return `${idPrefix}-part-${index}-method`;
}

function amountId(idPrefix: string, index: number): string {
  return `${idPrefix}-part-${index}-amount`;
}

function sumId(idPrefix: string): string {
  return `${idPrefix}-parts-sum`;
}

// The id of the refusal message, for a form that moves focus to it.
export function splitRefusalId(idPrefix: string): string {
  return `${idPrefix}-parts-refusal`;
}

// The ids Confirm's aria-describedby points at: the live line, then every row message showing.
export function splitDescribedBy(idPrefix: string, parts: PartDraft[]): string {
  const rowIds = partRowErrors(parts).flatMap((error, index) => [
    error.method === null ? null : `${methodId(idPrefix, index)}-error`,
    error.amount === null ? null : `${amountId(idPrefix, index)}-error`,
  ]);
  return [sumId(idPrefix), ...rowIds.filter((id) => id !== null)].join(" ");
}

// "Split payout" under the single Payout method field.
export function SplitPayoutLink({
  isPending,
  onClick,
}: SplitPayoutLinkProps): React.ReactNode {
  return (
    <Button
      type="button"
      variant="link"
      className="h-(--control-height) w-fit justify-start px-0 transition-opacity duration-fast active:opacity-70"
      disabled={isPending}
      onClick={onClick}
    >
      Split payout
    </Button>
  );
}

type PartRowProps = {
  idPrefix: string;
  index: number;
  part: PartDraft;
  errors: PartRowError;
  isLast: boolean;
  canRemove: boolean;
  isPending: boolean;
  onChange: (part: PartDraft) => void;
  onRemove: () => void;
};

function PartRow({
  idPrefix,
  index,
  part,
  errors,
  isLast,
  canRemove,
  isPending,
  onChange,
  onRemove,
}: PartRowProps): React.ReactNode {
  const number = index + 1;
  const methodErrorId = `${methodId(idPrefix, index)}-error`;
  const amountErrorId = `${amountId(idPrefix, index)}-error`;

  return (
    <li className={cn("space-y-1", index >= MIN_PARTS && ERROR_MOTION_CLASS)}>
      <div
        className={cn(
          "grid items-end gap-2",
          // Literal classes so Tailwind sees them; 7.5rem is the amount column.
          canRemove
            ? "grid-cols-[minmax(0,1fr)_7.5rem_auto]"
            : "grid-cols-[minmax(0,1fr)_7.5rem]",
        )}
      >
        <Field data-invalid={errors.method === null ? undefined : true}>
          <FieldLabel htmlFor={methodId(idPrefix, index)}>
            Method
            <span className="sr-only"> for part {number}</span>
          </FieldLabel>
          <PayoutMethodInput
            id={methodId(idPrefix, index)}
            name={`payout_part_${index}_method`}
            value={part.method}
            onChange={(event) =>
              onChange({ ...part, method: event.target.value })
            }
            placeholder="e.g. Cash"
            disabled={isPending}
            className={INPUT_HOVER_CLASS}
            error={errors.method}
            describedBy={errors.method === null ? undefined : methodErrorId}
          />
        </Field>
        <Field data-invalid={errors.amount === null ? undefined : true}>
          <FieldLabel htmlFor={amountId(idPrefix, index)}>
            Amount
            <span className="sr-only"> for part {number}</span>
          </FieldLabel>
          <InputGroup className={INPUT_HOVER_CLASS}>
            <InputGroupAddon>$</InputGroupAddon>
            <InputGroupInput
              id={amountId(idPrefix, index)}
              name={`payout_part_${index}_amount`}
              type="text"
              inputMode="decimal"
              enterKeyHint={isLast ? "done" : "next"}
              autoComplete="off"
              placeholder="0.00"
              value={part.amount}
              onChange={(event) =>
                onChange({ ...part, amount: event.target.value })
              }
              disabled={isPending}
              aria-invalid={errors.amount === null ? undefined : true}
              aria-describedby={
                errors.amount === null ? undefined : amountErrorId
              }
              className="font-mono tabular-nums"
            />
          </InputGroup>
        </Field>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={OUTLINE_PRESS_CLASS_NAME}
            aria-label={`Remove part ${number}`}
            disabled={isPending}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {errors.method === null ? null : (
        <FieldError id={methodErrorId} className={ERROR_MOTION_CLASS}>
          {errors.method}
        </FieldError>
      )}
      {errors.amount === null ? null : (
        <FieldError id={amountErrorId} className={ERROR_MOTION_CLASS}>
          {errors.amount}
        </FieldError>
      )}
    </li>
  );
}

// The part rows of a Split payout, with Add part, the live "left to assign" line and the way back
// to one method. The form owns the parts, so a refusal or a pending submit never loses them.
export function SplitPayoutEditor({
  idPrefix,
  parts,
  totalCents,
  isPending,
  refusal,
  shouldFocusOnMount,
  onChange,
  onUseOneMethod,
}: SplitPayoutEditorProps): React.ReactNode {
  // The id to focus once the next render has put it in the DOM (a new or shifted row).
  const focusIdRef = useRef<string | null>(null);
  const rowErrors = partRowErrors(parts);
  const sumLine = splitSumLineFor(parts, totalCents);
  const canRemove = parts.length > MIN_PARTS;

  useEffect(() => {
    if (!shouldFocusOnMount) return;
    document.getElementById(amountId(idPrefix, 0))?.focus();
    // Mount only: reopening an already-split run must not steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focusIdRef.current === null) return;
    document.getElementById(focusIdRef.current)?.focus();
    focusIdRef.current = null;
  });

  function handleAdd(): void {
    focusIdRef.current = methodId(idPrefix, parts.length);
    onChange([...parts, { method: "", amount: "" }]);
  }

  function handleRemove(index: number): void {
    const next = parts.filter((_, partIndex) => partIndex !== index);
    focusIdRef.current = methodId(idPrefix, Math.min(index, next.length - 1));
    onChange(next);
  }

  return (
    <div
      role="group"
      aria-labelledby={`${idPrefix}-parts-label`}
      className={cn("space-y-3", ERROR_MOTION_CLASS)}
    >
      <p id={`${idPrefix}-parts-label`} className="text-sm font-medium">
        Payout parts
      </p>
      <ul className="space-y-3">
        {parts.map((part, index) => (
          <PartRow
            key={index}
            idPrefix={idPrefix}
            index={index}
            part={part}
            errors={rowErrors[index]}
            isLast={index === parts.length - 1}
            canRemove={canRemove}
            isPending={isPending}
            onChange={(next) =>
              onChange(parts.map((item, i) => (i === index ? next : item)))
            }
            onRemove={() => handleRemove(index)}
          />
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className={cn(OUTLINE_PRESS_CLASS_NAME, "w-full sm:w-auto")}
        disabled={isPending}
        onClick={handleAdd}
      >
        <Plus data-icon="inline-start" aria-hidden="true" />
        Add part
      </Button>
      {refusal === null ? null : (
        <FieldError
          id={splitRefusalId(idPrefix)}
          tabIndex={-1}
          className={cn(ERROR_MOTION_CLASS, "text-sm outline-none")}
        >
          {refusal}
        </FieldError>
      )}
      <p
        id={sumId(idPrefix)}
        role="status"
        className={cn(
          "flex items-center gap-1.5 text-sm transition-colors duration-base",
          sumLine.tone === "destructive"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      >
        {sumLine.tone === "destructive" ? (
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
        ) : null}
        {sumLine.text}
      </p>
      <Button
        type="button"
        variant="link"
        className="h-(--control-height) w-fit justify-start px-0 transition-opacity duration-fast active:opacity-70"
        disabled={isPending}
        onClick={onUseOneMethod}
      >
        Use one method
      </Button>
    </div>
  );
}
