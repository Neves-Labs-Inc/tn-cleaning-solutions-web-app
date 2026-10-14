"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  BlockedBadge,
  SpecBadge,
} from "@/components/admin/payroll/payroll-badges";
import { PayoutMethodInput } from "@/components/admin/payroll/payout-method-input";
import {
  ERROR_MOTION_CLASS,
  INPUT_HOVER_CLASS,
  STICKY_FOOTER_CLASS,
} from "@/components/admin/payroll/payout-sheet-classes";
import { CONNECTION_ERROR_MESSAGE } from "@/components/invoices/invoice-detail-context";
import {
  SHEET_BUTTON_CLASS,
  SheetButtons,
} from "@/components/invoices/sheet-buttons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { OFF_CYCLE_BADGE } from "@/components/ui/status-badge-tones";
import SubmitButton from "@/components/ui/submit-button";
import { useBusinessDateOnOpen } from "@/hooks/use-business-date-on-open";
import { useFocusAfterPending } from "@/hooks/use-focus-after-pending";
import { markPayRunsPaid } from "@/lib/actions/payroll";
import { pluralize } from "@/lib/payroll/format";
import {
  getBlockerLink,
  markPaidSubmitLabel,
  markPaidSuccessText,
  methodError,
  paidOnError,
  readMarkPaidRows,
} from "@/lib/payroll/mark-paid";
import { formatShortDate } from "@/lib/payroll/period";
import { getFirstName } from "@/lib/payroll/period-actions";
import type { PeriodRun } from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type MarkPaidRunsFormProps = {
  // Finalized runs with nothing known to block them; never empty.
  ready: PeriodRun[];
  // Finalized runs the page already knows are blocked: listed as Skipped, never sent.
  blocked: PeriodRun[];
  periodStart: string;
  periodEnd: string;
  onCancel: () => void;
  // Some or all runs were paid: the sheet closes and the page refreshes.
  onSuccess: (paidRuns: PeriodRun[]) => void;
  // The server refused every run: the page behind may be stale.
  onRefusal: () => void;
  onPendingChange: (isPending: boolean) => void;
};

const PARTIAL_TOAST_DURATION_MS = 8000;
const SERVER_ERROR_STATUS = 500;

function joinIds(ids: (string | null)[]): string | undefined {
  const present = ids.filter((id) => id !== null);
  return present.length === 0 ? undefined : present.join(" ");
}

function Amount({ cents }: { cents: number }): React.ReactNode {
  return (
    <span
      className={cn(
        "shrink-0 font-mono text-sm tabular-nums",
        cents < 0 && "text-destructive",
      )}
    >
      {formatCents(cents)}
    </span>
  );
}

function RunName({ run }: { run: PeriodRun }): React.ReactNode {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 text-sm font-medium break-words">
        {run.cleaner.name}
      </span>
      {run.kind === "off_cycle" ? <SpecBadge spec={OFF_CYCLE_BADGE} /> : null}
    </span>
  );
}

// A run the page knows is blocked: no input, not counted, with where to fix it.
export function SkippedRunRow({ run }: { run: PeriodRun }): React.ReactNode {
  const link = getBlockerLink(run);

  return (
    <li className="space-y-1 p-3 text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 text-sm font-medium break-words">
          {run.cleaner.name}
        </span>
        <BlockedBadge />
        <span className="text-sm">Skipped</span>
      </div>
      <p className="text-xs break-words">{run.blockedReason}</p>
      {link === null ? null : (
        // 44 px tall on phones, like every control in the sheet.
        <Link
          href={link.href}
          className="inline-flex min-h-11 items-center text-xs underline underline-offset-4 hover:text-primary md:min-h-0"
        >
          {link.label}
        </Link>
      )}
    </li>
  );
}

type MethodRowProps = {
  run: PeriodRun;
  inputId: string;
  value: string;
  serverError: string | null;
  isPending: boolean;
  onChange: (value: string) => void;
};

function MethodRow({
  run,
  inputId,
  value,
  serverError,
  isPending,
  onChange,
}: MethodRowProps): React.ReactNode {
  const hint = methodError(value, getFirstName(run.cleaner.name));
  const ids = {
    contact: `${inputId}-contact`,
    noDefault: `${inputId}-no-default`,
    hint: `${inputId}-hint`,
    error: `${inputId}-error`,
  };
  const hasNoDefault = run.defaultPayoutMethod === null;

  return (
    <li className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <RunName run={run} />
        <Amount cents={run.totalCents} />
      </div>
      <Field data-invalid={serverError === null ? undefined : true}>
        <FieldLabel htmlFor={inputId}>
          Payout method
          {/* Every row has this label; the name tells them apart for a screen reader. */}
          <span className="sr-only"> for {run.cleaner.name}</span>
        </FieldLabel>
        <PayoutMethodInput
          id={inputId}
          name={`payout_method_${run.runId}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="e.g. Cash"
          disabled={isPending}
          className={INPUT_HOVER_CLASS}
          error={serverError}
          describedBy={joinIds([
            serverError === null ? null : ids.error,
            hint === null ? null : ids.hint,
            run.eTransferContact === null ? null : ids.contact,
            hasNoDefault ? ids.noDefault : null,
          ])}
        />
        {serverError === null ? null : (
          <FieldError id={ids.error} className={ERROR_MOTION_CLASS}>
            {serverError}
          </FieldError>
        )}
        {hint === null || serverError !== null ? null : (
          <FieldDescription id={ids.hint}>{hint}</FieldDescription>
        )}
        {run.eTransferContact === null ? null : (
          <FieldDescription id={ids.contact} className="break-words">
            e-Transfer to {run.eTransferContact}
          </FieldDescription>
        )}
        {hasNoDefault ? (
          <FieldDescription id={ids.noDefault}>
            No default method set
          </FieldDescription>
        ) : null}
      </Field>
    </li>
  );
}

// Mark paid for one or more finalized runs: a Payout method per run, one shared paid date.
export default function MarkPaidRunsForm({
  ready,
  blocked,
  periodStart,
  periodEnd,
  onCancel,
  onSuccess,
  onRefusal,
  onPendingChange,
}: MarkPaidRunsFormProps): React.ReactNode {
  const businessDate = useBusinessDateOnOpen();
  const idPrefix = useId();
  const paidOnRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [isPending, startTransition] = useTransition();
  const focusAfterPending = useFocusAfterPending(isPending);
  const [methods, setMethods] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ready.map((run) => [run.key, run.defaultPayoutMethod ?? ""]),
    ),
  );
  const [paidOn, setPaidOn] = useState(businessDate);
  // The server's refusals, by field; cleared as soon as that field changes.
  const [serverPaidOnError, setServerPaidOnError] = useState<string | null>(
    null,
  );
  const [serverMethodErrors, setServerMethodErrors] = useState<
    Record<string, string>
  >({});
  const [formError, setFormError] = useState<string | null>(null);

  const ids = {
    paidOn: `${idPrefix}-paid-on`,
    paidOnError: `${idPrefix}-paid-on-error`,
    paidOnHint: `${idPrefix}-paid-on-hint`,
  };
  const dateError =
    serverPaidOnError ?? paidOnError(paidOn, periodEnd, businessDate);
  const hasBlankMethod = ready.some(
    (run) => (methods[run.key] ?? "").trim() === "",
  );
  const totalCents = ready.reduce((sum, run) => sum + run.totalCents, 0);

  function methodInputId(run: PeriodRun): string {
    return `${idPrefix}-method-${run.key}`;
  }

  function handleMethodChange(run: PeriodRun, value: string): void {
    setMethods({ ...methods, [run.key]: value });
    if (run.runId !== null && run.runId in serverMethodErrors) {
      setServerMethodErrors(
        Object.fromEntries(
          Object.entries(serverMethodErrors).filter(
            ([runId]) => runId !== run.runId,
          ),
        ),
      );
    }
  }

  function showRefusal(feedback: ReturnType<typeof readMarkPaidRows>): void {
    onRefusal();
    setServerPaidOnError(feedback.paidOnError);
    setServerMethodErrors(feedback.methodErrors);
    setFormError(feedback.hasUnplacedRefusal ? feedback.text : null);

    const firstMethodRun = ready.find(
      (run) => run.runId !== null && run.runId in feedback.methodErrors,
    );
    let target: HTMLElement | null = submitRef.current;
    if (feedback.paidOnError !== null) {
      target = paidOnRef.current;
    } else if (firstMethodRun !== undefined) {
      target = document.getElementById(methodInputId(firstMethodRun));
    }
    focusAfterPending(target);
  }

  // The Alert says what failed; Confirm keeps focus so a retry is one key away.
  function showFormError(message: string): void {
    setFormError(message);
    focusAfterPending(submitRef.current);
  }

  async function submit(): Promise<void> {
    const items = ready.flatMap((run) =>
      run.runId === null
        ? []
        : [{ runId: run.runId, payoutMethod: methods[run.key] ?? "" }],
    );

    let result: Awaited<ReturnType<typeof markPayRunsPaid>>;
    try {
      result = await markPayRunsPaid(periodStart, items, paidOn);
    } catch (cause) {
      console.error("payroll: mark paid request failed", cause);
      showFormError(CONNECTION_ERROR_MESSAGE);
      return;
    }

    if (result.value === null) {
      onRefusal();
      showFormError(
        result.status >= SERVER_ERROR_STATUS || result.error === null
          ? CONNECTION_ERROR_MESSAGE
          : result.error,
      );
      return;
    }

    const feedback = readMarkPaidRows(result.value, ready, periodEnd);
    const paidCount = feedback.paidRuns.length;
    if (paidCount === 0) {
      showRefusal(feedback);
    } else if (paidCount < result.value.length) {
      onSuccess(feedback.paidRuns);
      toast.warning(feedback.text, { duration: PARTIAL_TOAST_DURATION_MS });
    } else {
      onSuccess(feedback.paidRuns);
      toast.success(markPaidSuccessText(feedback.paidRuns));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (dateError !== null) {
      paidOnRef.current?.focus();
      return;
    }
    if (hasBlankMethod) return;

    setFormError(null);
    startTransition(submit);
  }

  return (
    // noValidate: every check shows under its field instead of the browser's bubble.
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <ul className="divide-y rounded-lg border">
        {ready.map((run) => (
          <MethodRow
            key={run.key}
            run={run}
            inputId={methodInputId(run)}
            value={methods[run.key] ?? ""}
            serverError={
              run.runId === null ? null : (serverMethodErrors[run.runId] ?? null)
            }
            isPending={isPending}
            onChange={(value) => handleMethodChange(run, value)}
          />
        ))}
        {blocked.map((run) => (
          <SkippedRunRow key={run.key} run={run} />
        ))}
      </ul>

      <Field data-invalid={dateError === null ? undefined : true}>
        <FieldLabel htmlFor={ids.paidOn}>Paid on</FieldLabel>
        <Input
          ref={paidOnRef}
          id={ids.paidOn}
          name="paid_on"
          type="date"
          min={periodEnd}
          max={businessDate}
          value={paidOn}
          onChange={(event) => {
            setPaidOn(event.target.value);
            setServerPaidOnError(null);
          }}
          disabled={isPending}
          aria-invalid={dateError === null ? undefined : true}
          aria-describedby={dateError === null ? ids.paidOnHint : ids.paidOnError}
          className={INPUT_HOVER_CLASS}
        />
        {dateError === null ? (
          <FieldDescription id={ids.paidOnHint}>
            From {formatShortDate(periodEnd)} to today.
          </FieldDescription>
        ) : (
          <FieldError id={ids.paidOnError} className={ERROR_MOTION_CLASS}>
            {dateError}
          </FieldError>
        )}
      </Field>

      <p className="flex justify-between gap-3 border-t pt-3 text-sm font-semibold">
        <span>Total ({pluralize(ready.length, "run")})</span>
        <Amount cents={totalCents} />
      </p>

      {formError === null ? null : (
        <Alert variant="destructive" className={ERROR_MOTION_CLASS}>
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Couldn&apos;t mark paid</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className={STICKY_FOOTER_CLASS}>
        <SheetButtons
          onCancel={onCancel}
          onPendingChange={onPendingChange}
          isPending={isPending}
        >
          <SubmitButton
            ref={submitRef}
            label={markPaidSubmitLabel(ready.length, totalCents)}
            pendingLabel="Marking paid…"
            isPending={isPending}
            disabled={hasBlankMethod}
            className={SHEET_BUTTON_CLASS}
          />
        </SheetButtons>
      </div>
    </form>
  );
}
