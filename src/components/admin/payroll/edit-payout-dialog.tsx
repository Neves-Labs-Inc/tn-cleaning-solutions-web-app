"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";

import { OUTLINE_PRESS_CLASS_NAME } from "@/components/admin/detail-page/press";
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
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import ResponsiveDialog from "@/components/ui/responsive-dialog";
import SubmitButton from "@/components/ui/submit-button";
import { useBusinessDateOnOpen } from "@/hooks/use-business-date-on-open";
import { useFocusAfterPending } from "@/hooks/use-focus-after-pending";
import { updatePayRunPayout } from "@/lib/actions/payroll";
import {
  methodError,
  paidOnError,
  paidOnFieldError,
} from "@/lib/payroll/mark-paid";
import { formatShortDate } from "@/lib/payroll/period";
import { getFirstName } from "@/lib/payroll/period-actions";
import type { PeriodRun } from "@/lib/payroll/period-view";
import { formatCents } from "@/lib/pricing/money";
import { cn } from "@/lib/utils";

type EditPayoutDialogProps = {
  // A paid run: runId, payoutMethod and paidOn are set.
  run: PeriodRun;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  className?: string;
};

type EditPayoutFormProps = Omit<
  EditPayoutDialogProps,
  "periodLabel" | "className"
> & {
  onCancel: () => void;
  onSuccess: () => void;
  onPendingChange: (isPending: boolean) => void;
};

const SERVER_ERROR_STATUS = 500;

function EditPayoutForm({
  run,
  periodStart,
  periodEnd,
  onCancel,
  onSuccess,
  onPendingChange,
}: EditPayoutFormProps): React.ReactNode {
  const businessDate = useBusinessDateOnOpen();
  const idPrefix = useId();
  const paidOnRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [isPending, startTransition] = useTransition();
  const focusAfterPending = useFocusAfterPending(isPending);
  const [method, setMethod] = useState(run.payoutMethod ?? "");
  const [paidOn, setPaidOn] = useState(run.paidOn ?? businessDate);
  // The server's paid-date refusal; cleared as soon as the date changes.
  const [serverPaidOnError, setServerPaidOnError] = useState<string | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const ids = {
    method: `${idPrefix}-method`,
    methodHint: `${idPrefix}-method-hint`,
    contact: `${idPrefix}-contact`,
    paidOn: `${idPrefix}-paid-on`,
    paidOnError: `${idPrefix}-paid-on-error`,
    paidOnHint: `${idPrefix}-paid-on-hint`,
  };
  const methodHint = methodError(method, getFirstName(run.cleaner.name));
  const dateError =
    serverPaidOnError ?? paidOnError(paidOn, periodEnd, businessDate);
  const methodDescribedBy = [
    methodHint === null ? null : ids.methodHint,
    run.eTransferContact === null ? null : ids.contact,
  ].filter((id) => id !== null);

  async function submit(runId: string): Promise<void> {
    let result: Awaited<ReturnType<typeof updatePayRunPayout>>;
    try {
      result = await updatePayRunPayout(periodStart, {
        runId,
        payoutMethod: method,
        paidOn,
      });
    } catch (cause) {
      console.error("payroll: update payout request failed", cause);
      showFormError(CONNECTION_ERROR_MESSAGE);
      return;
    }

    const fieldError =
      result.error === null ? null : paidOnFieldError(result.error, periodEnd);
    if (result.error === null) {
      onSuccess();
      toast.success("Payout updated");
    } else if (fieldError !== null) {
      setServerPaidOnError(fieldError);
      focusAfterPending(paidOnRef.current);
    } else {
      showFormError(
        result.status >= SERVER_ERROR_STATUS
          ? CONNECTION_ERROR_MESSAGE
          : result.error,
      );
    }
  }

  // The Alert says what failed; Save keeps focus so a retry is one key away.
  function showFormError(message: string): void {
    setFormError(message);
    focusAfterPending(submitRef.current);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const { runId } = run;
    if (dateError !== null) {
      paidOnRef.current?.focus();
      return;
    }
    if (methodHint !== null || runId === null) return;

    setFormError(null);
    startTransition(() => submit(runId));
  }

  return (
    // noValidate: every check shows under its field instead of the browser's bubble.
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <Field>
        <FieldLabel htmlFor={ids.method}>Payout method</FieldLabel>
        <PayoutMethodInput
          id={ids.method}
          name="payout_method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          placeholder="e.g. Cash"
          disabled={isPending}
          className={INPUT_HOVER_CLASS}
          describedBy={
            methodDescribedBy.length === 0
              ? undefined
              : methodDescribedBy.join(" ")
          }
        />
        {methodHint === null ? null : (
          <FieldDescription id={ids.methodHint}>{methodHint}</FieldDescription>
        )}
        {run.eTransferContact === null ? null : (
          <FieldDescription id={ids.contact} className="break-words">
            e-Transfer to {run.eTransferContact}
          </FieldDescription>
        )}
      </Field>

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
          aria-describedby={
            dateError === null ? ids.paidOnHint : ids.paidOnError
          }
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

      <p className="text-xs text-muted-foreground">
        A paid run can&apos;t go back to unpaid. Fix money with an Adjustment
        on a later run.
      </p>

      {formError === null ? null : (
        <Alert variant="destructive" className={ERROR_MOTION_CLASS}>
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Couldn&apos;t update payout</AlertTitle>
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
            label="Save"
            pendingLabel="Saving…"
            isPending={isPending}
            disabled={methodHint !== null}
            className={SHEET_BUTTON_CLASS}
          />
        </SheetButtons>
      </div>
    </form>
  );
}

// A paid run's Edit payout button and its dialog: the method and paid date, never back to unpaid.
export default function EditPayoutDialog({
  run,
  periodStart,
  periodEnd,
  periodLabel,
  className,
}: EditPayoutDialogProps): React.ReactNode {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  function handleSuccess(): void {
    setIsOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn(OUTLINE_PRESS_CLASS_NAME, className)}
        onClick={() => setIsOpen(true)}
      >
        <Pencil data-icon="inline-start" aria-hidden="true" />
        Edit payout
      </Button>
      <ResponsiveDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Edit payout"
        description={`${run.cleaner.name} · Pay period ${periodLabel} · ${formatCents(run.totalCents)}`}
        isPending={isPending}
      >
        {isOpen ? (
          <EditPayoutForm
            run={run}
            periodStart={periodStart}
            periodEnd={periodEnd}
            onCancel={() => setIsOpen(false)}
            onSuccess={handleSuccess}
            onPendingChange={setIsPending}
          />
        ) : null}
      </ResponsiveDialog>
    </>
  );
}
