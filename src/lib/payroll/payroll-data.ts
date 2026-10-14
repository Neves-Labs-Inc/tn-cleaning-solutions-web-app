import type { Database, Tables } from "../../types/database.ts";

// What the Payroll queries read and the pure view builders shape. One shape serves a single Pay
// period (fetchPayPeriodData) and a range of them (fetchPayPeriodsOverview); the builders filter
// by period themselves.

export type PaySessionRow =
  Database["public"]["Views"]["pay_period_sessions"]["Row"];

export type PayRunRow = Pick<
  Tables<"pay_runs">,
  | "id"
  | "employee_id"
  | "period_start"
  | "kind"
  | "status"
  | "paid_on"
  | "payout_method"
>;

// A claim. Its frozen columns are set only once its run is paid.
export type PayRunLineRow = Pick<
  Tables<"pay_run_lines">,
  | "pay_run_id"
  | "appointment_employee_id"
  | "scheduled_date"
  | "client_name"
  | "job_name"
  | "minutes"
  | "rate_cents"
  | "amount_cents"
>;

export type PayAdjustmentRow = Pick<
  Tables<"pay_adjustments">,
  | "id"
  | "pay_run_id"
  | "amount_cents"
  | "reason"
  | "appointment_employee_id"
  | "created_at"
>;

export type PayCleaner = {
  id: string;
  fullName: string;
  // False for an inactive or archived Cleaner; she still gets a row for work in the period.
  isActive: boolean;
  defaultPayoutMethod: string | null;
  eTransferContact: string | null;
};

export type PayrollData = {
  sessions: PaySessionRow[];
  runs: PayRunRow[];
  runLines: PayRunLineRow[];
  adjustments: PayAdjustmentRow[];
  cleaners: PayCleaner[];
  // Sessions with a Clock correction, shown as Edited.
  editedSessionIds: string[];
};
