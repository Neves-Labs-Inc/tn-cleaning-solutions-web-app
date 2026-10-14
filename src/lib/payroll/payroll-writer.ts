// Relative imports: node --test runs this file without the @/ alias.
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type {
  AdjustmentInput,
  MarkPaidItem,
  PayoutEdit,
  RunTarget,
} from "./action-input.ts";
import type { BulkResultRow } from "./bulk-result.ts";
import type { MarkPaidRow } from "./mark-paid.ts";
import {
  getPayrollErrorStatus,
  toPayrollError,
  UNKNOWN_PAYROLL_MESSAGE,
} from "./errors.ts";
import type { Result } from "../result.ts";
import type { Database } from "../../types/database.ts";

type Db = SupabaseClient<Database>;
type Logger = Pick<Console, "warn" | "error">;

// One finalize_pay_runs row, by Cleaner.
export type FinalizeRow = BulkResultRow & {
  employeeId: string;
  payRunId: string | null;
};

const STATUS_OK = 200;
const STATUS_CREATED = 201;
const STATUS_SERVER_ERROR = 500;

// The Payroll writes the period page makes. Each calls one SQL function (20261014231000), which
// checks the admin role and every rule; a payroll_error refusal comes back as a readable 4xx
// Result, anything else as a logged 500 with a generic message.
export class PayrollWriter {
  readonly #db: Db;
  readonly #logger: Logger;

  constructor(db: Db, logger: Logger = console) {
    this.#db = db;
    this.#logger = logger;
  }

  // Finalizes each Cleaner's current draft; a refused Cleaner is a row, not a failure.
  async finalize(
    periodStart: string,
    employeeIds: string[],
  ): Promise<Result<FinalizeRow[]>> {
    const targets = employeeIds.map((employeeId) => ({
      employee_id: employeeId,
      period_start: periodStart,
    }));
    const { data, error } = await this.#db.rpc("finalize_pay_runs", {
      p_targets: targets,
    });
    if (error)
      return this.#fail("finalize", { periodStart, employeeIds }, error);

    const rows = (data ?? []).map((row) => ({
      employeeId: row.employee_id,
      payRunId: row.pay_run_id,
      code: row.code,
      message: row.message,
      detail: row.detail,
    }));
    return { value: rows, error: null, status: STATUS_OK };
  }

  async undoFinalize(runId: string): Promise<Result<null>> {
    const { error } = await this.#db.rpc("undo_finalize_pay_run", {
      p_run_id: runId,
    });
    if (error) return this.#fail("undo finalize", { runId }, error);
    return { value: null, error: null, status: STATUS_OK };
  }

  async addAdjustment(
    target: RunTarget,
    input: AdjustmentInput,
  ): Promise<Result<{ adjustmentId: string }>> {
    const { data, error } = await this.#db.rpc("add_pay_adjustment", {
      p_employee_id: target.employeeId,
      p_period_start: target.periodStart,
      p_amount_cents: input.amountCents,
      p_reason: input.reason,
      p_appointment_employee_id: input.appointmentEmployeeId,
    });
    if (error) return this.#fail("add adjustment", target, error);
    return {
      value: { adjustmentId: data },
      error: null,
      status: STATUS_CREATED,
    };
  }

  async deleteAdjustment(adjustmentId: string): Promise<Result<null>> {
    const { error } = await this.#db.rpc("delete_pay_adjustment", {
      p_adjustment_id: adjustmentId,
    });
    if (error) return this.#fail("delete adjustment", { adjustmentId }, error);
    return { value: null, error: null, status: STATUS_OK };
  }

  async addCleaner(target: RunTarget): Promise<Result<{ runId: string }>> {
    const { data, error } = await this.#db.rpc("add_cleaner_to_pay_period", {
      p_employee_id: target.employeeId,
      p_period_start: target.periodStart,
    });
    if (error) return this.#fail("add cleaner", target, error);
    return { value: { runId: data }, error: null, status: STATUS_CREATED };
  }

  async removeCleaner(target: RunTarget): Promise<Result<null>> {
    const { error } = await this.#db.rpc("remove_cleaner_from_pay_period", {
      p_employee_id: target.employeeId,
      p_period_start: target.periodStart,
    });
    if (error) return this.#fail("remove cleaner", target, error);
    return { value: null, error: null, status: STATUS_OK };
  }

  async startOffCycle(target: RunTarget): Promise<Result<{ runId: string }>> {
    const { data, error } = await this.#db.rpc("start_off_cycle_run", {
      p_employee_id: target.employeeId,
      p_period_start: target.periodStart,
    });
    if (error) return this.#fail("start off-cycle run", target, error);
    return { value: { runId: data }, error: null, status: STATUS_CREATED };
  }

  // Marks each run paid on one date; a refused run is a row, not a failure.
  async markPaid(
    items: MarkPaidItem[],
    paidOn: string,
  ): Promise<Result<MarkPaidRow[]>> {
    const { data, error } = await this.#db.rpc("mark_pay_runs_paid", {
      p_items: items.map((item) => ({
        run_id: item.runId,
        payout_method: item.payoutMethod,
      })),
      p_paid_on: paidOn,
    });
    if (error) {
      const runIds = items.map((item) => item.runId);
      return this.#fail("mark paid", { runIds, paidOn }, error);
    }

    const rows = (data ?? []).map((row) => ({
      payRunId: row.pay_run_id,
      code: row.code,
      message: row.message,
      detail: row.detail,
    }));
    return { value: rows, error: null, status: STATUS_OK };
  }

  async updatePayout(edit: PayoutEdit): Promise<Result<null>> {
    const { error } = await this.#db.rpc("update_pay_run_payout", {
      p_run_id: edit.runId,
      p_payout_method: edit.payoutMethod,
      p_paid_on: edit.paidOn,
    });
    // The method is free text, so it stays out of the logs.
    if (error) {
      const context = { runId: edit.runId, paidOn: edit.paidOn };
      return this.#fail("update payout", context, error);
    }
    return { value: null, error: null, status: STATUS_OK };
  }

  #fail<T>(
    operation: string,
    context: Record<string, unknown>,
    error: PostgrestError,
  ): Result<T> {
    const refusal = toPayrollError(error);

    let result: Result<T>;
    if (refusal.code === null) {
      this.#logger.error(`payroll: ${operation} failed`, context, error);
      result = {
        value: null,
        error: UNKNOWN_PAYROLL_MESSAGE,
        status: STATUS_SERVER_ERROR,
      };
    } else {
      this.#logger.warn(
        `payroll: ${operation} refused (${refusal.code})`,
        context,
      );
      result = {
        value: null,
        error: refusal.message,
        status: getPayrollErrorStatus(refusal.code),
      };
    }
    return result;
  }
}
