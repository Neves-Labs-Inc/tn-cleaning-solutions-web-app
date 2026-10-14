"use server";

import { revalidatePath } from "next/cache";

import {
  isDateText,
  isUuid,
  parseAdjustmentForm,
  parseRunTarget,
  type AdjustmentFieldErrors,
  type RunTarget,
} from "@/lib/payroll/action-input";
import {
  getPayrollErrorMessage,
  getPayrollErrorStatus,
} from "@/lib/payroll/errors";
import { PayrollWriter, type FinalizeRow } from "@/lib/payroll/payroll-writer";
import type { Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

// Thin by design: parse what the period page posts, call the SQL function through PayrollWriter,
// refresh the Payroll screens. The SQL functions check the admin role and every rule themselves.

export type PayrollActionResult<T = null> = Result<T>;

export type AdjustmentActionResult = Result<{ adjustmentId: string }> & {
  fieldErrors?: AdjustmentFieldErrors;
};

const PAYROLL_PATH = "/solutions/payroll";
const DASHBOARD_PATH = "/solutions/dashboard";
// A bulk Finalize runs one savepoint per Cleaner; no period has anywhere near this many.
const MAX_FINALIZE_TARGETS = 200;
const STATUS_BAD_REQUEST = 400;
const STATUS_UNPROCESSABLE = 422;
const INVALID_INPUT_MESSAGE =
  "Couldn't read that request. Reload and try again.";
const FIX_FIELDS_MESSAGE = "Fix the highlighted fields.";

function refuseInput<T>(): Result<T> {
  console.warn("payroll: action refused malformed input");
  return {
    value: null,
    error: INVALID_INPUT_MESSAGE,
    status: STATUS_BAD_REQUEST,
  };
}

function refuseNonAdmin<T>(): Result<T> {
  return {
    value: null,
    error: getPayrollErrorMessage("not_admin"),
    status: getPayrollErrorStatus("not_admin"),
  };
}

// The app's own role check, before any RPC or revalidation; the SQL functions check it again.
// null for anyone but a signed-in admin.
async function getAdminWriter(): Promise<PayrollWriter | null> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  let writer: PayrollWriter | null = null;
  if (user?.app_metadata?.role === "admin") {
    writer = new PayrollWriter(db);
  } else {
    console.warn("payroll: write refused, not an admin", user?.id ?? null);
  }
  return writer;
}

// Refreshes on a refusal too: most mean the page is stale (a run paid or started elsewhere).
// periodStart passed isDateText, so the path is never free text.
function revalidatePayroll(periodStart: string): void {
  revalidatePath(PAYROLL_PATH);
  revalidatePath(DASHBOARD_PATH);
  revalidatePath(`${PAYROLL_PATH}/${periodStart}`);
}

function parseTargets(
  periodStart: unknown,
  employeeIds: unknown,
): RunTarget[] | null {
  const ids = Array.isArray(employeeIds) ? [...new Set(employeeIds)] : [];
  const targets = ids.flatMap((employeeId) => {
    const target = parseRunTarget({ employeeId, periodStart });
    return target === null ? [] : [target];
  });
  const isValid =
    targets.length > 0 &&
    targets.length === ids.length &&
    targets.length <= MAX_FINALIZE_TARGETS;
  return isValid ? targets : null;
}

// One call for a run's own Finalize and for the bulk bar: one row per Cleaner, 'ok' or refused.
export async function finalizePayRuns(
  periodStart: string,
  employeeIds: string[],
): Promise<PayrollActionResult<FinalizeRow[]>> {
  const targets = parseTargets(periodStart, employeeIds);
  if (targets === null) return refuseInput();

  const writer = await getAdminWriter();
  if (writer === null) return refuseNonAdmin();
  const result = await writer.finalize(
    periodStart,
    targets.map((target) => target.employeeId),
  );
  revalidatePayroll(periodStart);
  return result;
}

// periodStart is only the page to refresh; the SQL finds the run's period itself.
export async function undoFinalizePayRun(
  runId: string,
  periodStart: string,
): Promise<PayrollActionResult> {
  if (!isUuid(runId) || !isDateText(periodStart)) return refuseInput();

  const writer = await getAdminWriter();
  if (writer === null) return refuseNonAdmin();
  const result = await writer.undoFinalize(runId);
  revalidatePayroll(periodStart);
  return result;
}

export async function addPayAdjustment(
  employeeId: string,
  periodStart: string,
  formData: FormData,
): Promise<AdjustmentActionResult> {
  const target = parseRunTarget({ employeeId, periodStart });
  if (target === null) return refuseInput();
  // Before the form is parsed, so a non-admin can't probe its validation messages.
  const writer = await getAdminWriter();
  if (writer === null) return refuseNonAdmin();

  const parsed = parseAdjustmentForm(formData);
  if (!parsed.success) {
    return {
      value: null,
      error: FIX_FIELDS_MESSAGE,
      status: STATUS_UNPROCESSABLE,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const result = await writer.addAdjustment(target, parsed.data);
  revalidatePayroll(target.periodStart);
  return result;
}

// periodStart is only the page to refresh; the SQL finds the Adjustment's run itself.
export async function deletePayAdjustment(
  adjustmentId: string,
  periodStart: string,
): Promise<PayrollActionResult> {
  if (!isUuid(adjustmentId) || !isDateText(periodStart)) {
    return refuseInput();
  }

  const writer = await getAdminWriter();
  if (writer === null) return refuseNonAdmin();
  const result = await writer.deleteAdjustment(adjustmentId);
  revalidatePayroll(periodStart);
  return result;
}

export async function addCleanerToPayPeriod(
  employeeId: string,
  periodStart: string,
): Promise<PayrollActionResult<{ runId: string }>> {
  const target = parseRunTarget({ employeeId, periodStart });
  if (target === null) return refuseInput();

  const writer = await getAdminWriter();
  if (writer === null) return refuseNonAdmin();
  const result = await writer.addCleaner(target);
  revalidatePayroll(target.periodStart);
  return result;
}

export async function removeCleanerFromPayPeriod(
  employeeId: string,
  periodStart: string,
): Promise<PayrollActionResult> {
  const target = parseRunTarget({ employeeId, periodStart });
  if (target === null) return refuseInput();

  const writer = await getAdminWriter();
  if (writer === null) return refuseNonAdmin();
  const result = await writer.removeCleaner(target);
  revalidatePayroll(target.periodStart);
  return result;
}

export async function startOffCycleRun(
  employeeId: string,
  periodStart: string,
): Promise<PayrollActionResult<{ runId: string }>> {
  const target = parseRunTarget({ employeeId, periodStart });
  if (target === null) return refuseInput();

  const writer = await getAdminWriter();
  if (writer === null) return refuseNonAdmin();
  const result = await writer.startOffCycle(target);
  revalidatePayroll(target.periodStart);
  return result;
}
