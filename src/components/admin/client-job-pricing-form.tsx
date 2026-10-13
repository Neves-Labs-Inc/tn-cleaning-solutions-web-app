"use client";

import { AlertCircle } from "lucide-react";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
} from "react";

import {
  SHEET_BUTTON_CLASS,
  SheetButtons,
} from "@/components/invoices/sheet-buttons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import SubmitButton from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { useAppointmentsCache } from "@/hooks/use-appointments-cache";
import {
  type ClientJobPricingActionResult,
  createClientJobPricing,
  updateClientJobPricing,
} from "@/lib/actions/client-job-pricing";
import { formatRate } from "@/lib/pricing/money";

export type PricingJob = { id: string; name: string; hourly_rate_cents: number };

type ClientJobPricingFormProps = {
  clientId: string;
  jobs: PricingJob[];
  businessDate: string;
  pricing?: {
    id: string;
    job_id: string;
    // Shown read-only: a rate's job can't change, and it may be archived.
    job_name: string;
    hourly_rate_cents: number;
    effective_from: string;
    notes: string | null;
  };
  onSuccess: () => void;
  onCancel: () => void;
  onPendingChange: (isPending: boolean) => void;
};

const initialState: ClientJobPricingActionResult = {
  success: false,
  error: "",
};

const SAVE_FAILED_MESSAGE = "Couldn't save the rate. Try again.";
const JOB_ERROR_ID = "pricing-job-error";
const RATE_HELP_ID = "pricing-rate-help";
const RATE_ERROR_ID = "pricing-rate-error";
const DATE_HELP_ID = "pricing-date-help";
const DATE_ERROR_ID = "pricing-date-error";

function joinIds(...ids: Array<string | false>): string | undefined {
  const present = ids.filter((id): id is string => Boolean(id));
  return present.length > 0 ? present.join(" ") : undefined;
}

// Lives inside a ResponsiveDialog: the sheet is the surface, so no card of its own.
export function ClientJobPricingForm({
  clientId,
  jobs,
  businessDate,
  pricing,
  onSuccess,
  onCancel,
  onPendingChange,
}: ClientJobPricingFormProps): React.ReactNode {
  const appointmentsCache = useAppointmentsCache();
  const jobRef = useRef<HTMLSelectElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const isEditMode = pricing !== undefined;
  const saveAction = pricing
    ? updateClientJobPricing.bind(null, pricing.id)
    : createClientJobPricing.bind(null, clientId);

  async function handleSave(
    previous: ClientJobPricingActionResult,
    formData: FormData,
  ): Promise<ClientJobPricingActionResult> {
    let result: ClientJobPricingActionResult;
    try {
      result = await saveAction(previous, formData);
    } catch (error) {
      console.error("Rate save failed", pricing?.id ?? clientId, error);
      result = { success: false, error: SAVE_FAILED_MESSAGE };
    }

    if (result.success) {
      // Appointment prices follow the rate in force, so cached prices are stale now.
      void appointmentsCache.refresh();
      onSuccess();
    }
    return result;
  }

  const [state, formAction, isPending] = useActionState(
    handleSave,
    initialState,
  );
  const fieldErrors = "fieldErrors" in state ? state.fieldErrors : undefined;
  const formError = !state.success && !fieldErrors ? state.error : "";

  // A refused save puts focus on the first field to fix.
  useEffect(() => {
    if (fieldErrors?.job_id) {
      jobRef.current?.focus();
    } else if (fieldErrors?.hourly_rate_cents) {
      rateRef.current?.focus();
    } else if (fieldErrors?.effective_from) {
      dateRef.current?.focus();
    }
  }, [fieldErrors]);

  // Dispatched by hand rather than through <form action>: React resets an action form's fields
  // after every submit, and a refused save must keep what the admin typed.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {pricing ? (
        <Field>
          <FieldTitle>Job</FieldTitle>
          <p className="text-sm break-words text-foreground">
            {pricing.job_name}
          </p>
        </Field>
      ) : (
        <Field data-invalid={Boolean(fieldErrors?.job_id)}>
          <FieldLabel htmlFor="pricing-job">Job</FieldLabel>
          <NativeSelect
            ref={jobRef}
            id="pricing-job"
            name="job_id"
            required
            className="w-full"
            defaultValue=""
            aria-invalid={Boolean(fieldErrors?.job_id)}
            aria-describedby={fieldErrors?.job_id ? JOB_ERROR_ID : undefined}
          >
            <NativeSelectOption value="" disabled>
              Select a job
            </NativeSelectOption>
            {jobs.map((job) => (
              <NativeSelectOption key={job.id} value={job.id}>
                {job.name} — standard {formatRate(job.hourly_rate_cents)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {fieldErrors?.job_id ? (
            <FieldError id={JOB_ERROR_ID}>{fieldErrors.job_id}</FieldError>
          ) : null}
        </Field>
      )}

      <Field data-invalid={Boolean(fieldErrors?.hourly_rate_cents)}>
        <FieldLabel htmlFor="pricing-rate">Rate ($/hour)</FieldLabel>
        <Input
          ref={rateRef}
          id="pricing-rate"
          name="hourly_rate_cents"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          enterKeyHint="next"
          required
          defaultValue={
            pricing ? (pricing.hourly_rate_cents / 100).toFixed(2) : ""
          }
          aria-invalid={Boolean(fieldErrors?.hourly_rate_cents)}
          aria-describedby={joinIds(
            RATE_HELP_ID,
            Boolean(fieldErrors?.hourly_rate_cents) && RATE_ERROR_ID,
          )}
        />
        <FieldDescription id={RATE_HELP_ID}>
          Charged per scheduled hour for this client&apos;s appointments on
          this job.
        </FieldDescription>
        {fieldErrors?.hourly_rate_cents ? (
          <FieldError id={RATE_ERROR_ID}>
            {fieldErrors.hourly_rate_cents}
          </FieldError>
        ) : null}
      </Field>

      <Field data-invalid={Boolean(fieldErrors?.effective_from)}>
        <FieldLabel htmlFor="pricing-date">Effective from</FieldLabel>
        <Input
          ref={dateRef}
          id="pricing-date"
          name="effective_from"
          type="date"
          enterKeyHint="next"
          required
          defaultValue={pricing?.effective_from ?? businessDate}
          aria-invalid={Boolean(fieldErrors?.effective_from)}
          aria-describedby={joinIds(
            DATE_HELP_ID,
            Boolean(fieldErrors?.effective_from) && DATE_ERROR_ID,
          )}
        />
        <FieldDescription id={DATE_HELP_ID}>
          Applies to appointments scheduled on or after this date. Earlier
          appointments keep the previous rate.
        </FieldDescription>
        {fieldErrors?.effective_from ? (
          <FieldError id={DATE_ERROR_ID}>
            {fieldErrors.effective_from}
          </FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="pricing-notes">Notes</FieldLabel>
        <Textarea
          id="pricing-notes"
          name="notes"
          enterKeyHint="done"
          defaultValue={pricing?.notes ?? ""}
          placeholder="e.g. Loyalty rate agreed Sept 2026"
        />
      </Field>

      {formError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <SheetButtons
        onCancel={onCancel}
        onPendingChange={onPendingChange}
        isPending={isPending}
      >
        <SubmitButton
          className={SHEET_BUTTON_CLASS}
          label={isEditMode ? "Save changes" : "Add rate"}
          pendingLabel={isEditMode ? "Saving…" : "Adding…"}
          isPending={isPending}
        />
      </SheetButtons>
    </form>
  );
}
