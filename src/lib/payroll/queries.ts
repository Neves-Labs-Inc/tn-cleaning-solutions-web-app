import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type {
  PayAdjustmentRow,
  PayCleaner,
  PayrollData,
  PayRunLineRow,
  PayRunRow,
  PaySessionRow,
} from "./payroll-data.ts";
import type {
  MyPayAdjustmentRow,
  MyPayLineRow,
  MyPayRunRow,
} from "./my-pay.ts";
import type { PayRateRow } from "./export-model.ts";
import { getPayPeriod, PAYROLL_START } from "./period.ts";
import { getBusinessDate } from "../schedule/business-time.ts";

// Payroll reads. Each takes the admin's user-session client and throws on a failed read, to the
// route's error boundary. No `server-only` import, so node:test can load this file; call these
// from server code only. The pay view and pay tables are admin-only through RLS, so any other
// caller reads empty results.

type Db = SupabaseClient<Database>;
type PageResult = { data: unknown; error: unknown };
type PageQuery = (from: number, to: number) => PromiseLike<PageResult>;
type PeriodRange = { from: string; to: string };

// PostgREST caps a response at its max-rows setting, so reads page until a short page comes back.
const PAGE_SIZE = 1000;
// Session ids per Clock correction lookup, to keep each request URL short.
const ID_CHUNK_SIZE = 100;

const SESSION_COLUMNS = `
  employee_id, period_start, appointment_id, appointment_employee_id, scheduled_date,
  scheduled_start_time, scheduled_end_time, client_name, job_name, appointment_status,
  is_payable, clocked_in_at, clocked_out_at, state, is_open_shift, is_missing_clock,
  is_odd_duration, clocked_minutes, base_rate_cents, pay_premium_cents, effective_rate_cents,
  amount_cents, has_no_rate, pay_run_id, pay_run_kind, pay_run_status
`;
const RUN_COLUMNS =
  "id, employee_id, period_start, kind, status, paid_on, payout_method";
const RUN_LINE_COLUMNS = `
  id, pay_run_id, appointment_employee_id, scheduled_date, client_name, job_name, minutes,
  rate_cents, amount_cents,
  pay_run:pay_runs!inner ( period_start )
`;
const ADJUSTMENT_COLUMNS = `
  id, pay_run_id, amount_cents, reason, appointment_employee_id, created_at,
  pay_run:pay_runs!inner ( period_start )
`;
const EMPLOYEE_COLUMNS =
  "id, full_name, is_active, is_archived, default_payout_method, e_transfer_contact";

type RunLineRead = PayRunLineRow & { id: string };
type AdjustmentRead = PayAdjustmentRow;
type EmployeeRead = {
  id: string;
  full_name: string;
  is_active: boolean;
  is_archived: boolean;
  default_payout_method: string | null;
  e_transfer_contact: string | null;
};

// Each page must be ordered by a unique key, or rows can repeat or vanish between pages.
async function readAllPages<T>(queryPage: PageQuery): Promise<T[]> {
  let rows: T[] = [];
  for (let from = 0, isLastPage = false; !isLastPage; from += PAGE_SIZE) {
    const { data, error } = await queryPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    // The select strings above define the row shape; the typed client can't infer the aliases.
    const page = (data ?? []) as T[];
    rows = [...rows, ...page];
    isLastPage = page.length < PAGE_SIZE;
  }
  return rows;
}

function fetchSessions(db: Db, range: PeriodRange): Promise<PaySessionRow[]> {
  return readAllPages<PaySessionRow>((from, to) =>
    db
      .from("pay_period_sessions")
      .select(SESSION_COLUMNS)
      .gte("period_start", range.from)
      .lte("period_start", range.to)
      .order("appointment_employee_id", { ascending: true })
      .range(from, to),
  );
}

function fetchRuns(db: Db, range: PeriodRange): Promise<PayRunRow[]> {
  return readAllPages<PayRunRow>((from, to) =>
    db
      .from("pay_runs")
      .select(RUN_COLUMNS)
      .gte("period_start", range.from)
      .lte("period_start", range.to)
      .order("id", { ascending: true })
      .range(from, to),
  );
}

async function fetchRunLines(
  db: Db,
  range: PeriodRange,
): Promise<PayRunLineRow[]> {
  const rows = await readAllPages<RunLineRead>((from, to) =>
    db
      .from("pay_run_lines")
      .select(RUN_LINE_COLUMNS)
      .gte("pay_run.period_start", range.from)
      .lte("pay_run.period_start", range.to)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map((row) => ({
    pay_run_id: row.pay_run_id,
    appointment_employee_id: row.appointment_employee_id,
    scheduled_date: row.scheduled_date,
    client_name: row.client_name,
    job_name: row.job_name,
    minutes: row.minutes,
    rate_cents: row.rate_cents,
    amount_cents: row.amount_cents,
  }));
}

async function fetchAdjustments(
  db: Db,
  range: PeriodRange,
): Promise<PayAdjustmentRow[]> {
  const rows = await readAllPages<AdjustmentRead>((from, to) =>
    db
      .from("pay_adjustments")
      .select(ADJUSTMENT_COLUMNS)
      .gte("pay_run.period_start", range.from)
      .lte("pay_run.period_start", range.to)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map((row) => ({
    id: row.id,
    pay_run_id: row.pay_run_id,
    amount_cents: row.amount_cents,
    reason: row.reason,
    appointment_employee_id: row.appointment_employee_id,
    created_at: row.created_at,
  }));
}

// Every Cleaner, archived ones included: one may still have shifts or runs in an older period.
async function fetchCleaners(db: Db): Promise<PayCleaner[]> {
  const rows = await readAllPages<EmployeeRead>((from, to) =>
    db
      .from("employees")
      .select(EMPLOYEE_COLUMNS)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    isActive: row.is_active && !row.is_archived,
    defaultPayoutMethod: row.default_payout_method,
    eTransferContact: row.e_transfer_contact,
  }));
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

async function fetchEditedSessionIds(
  db: Db,
  sessionIds: string[],
): Promise<string[]> {
  let edited: string[] = [];
  for (const ids of chunk(sessionIds, ID_CHUNK_SIZE)) {
    const rows = await readAllPages<{ appointment_employee_id: string }>(
      (from, to) =>
        db
          .from("clock_corrections")
          .select("id, appointment_employee_id")
          .in("appointment_employee_id", ids)
          .order("id", { ascending: true })
          .range(from, to),
    );
    edited = [...edited, ...rows.map((row) => row.appointment_employee_id)];
  }
  return [...new Set(edited)];
}

async function fetchPayrollData(
  db: Db,
  range: PeriodRange,
): Promise<PayrollData> {
  const [sessions, runs, runLines, adjustments, cleaners] = await Promise.all([
    fetchSessions(db, range),
    fetchRuns(db, range),
    fetchRunLines(db, range),
    fetchAdjustments(db, range),
    fetchCleaners(db),
  ]);
  return {
    sessions,
    runs,
    runLines,
    adjustments,
    cleaners,
    editedSessionIds: [],
  };
}

// One Pay period, for its page: pay view rows, runs, claims, Adjustments, every Cleaner's name,
// active state, default Payout method and e-Transfer contact, and which sessions were edited.
// `periodStart` must be a valid period start (see parsePeriodParam).
export async function fetchPayPeriodData(
  db: Db,
  periodStart: string,
): Promise<PayrollData> {
  const data = await fetchPayrollData(db, {
    from: periodStart,
    to: periodStart,
  });
  const editedSessionIds = await fetchEditedSessionIds(
    db,
    data.sessions.map((row) => row.appointment_employee_id),
  );
  return { ...data, editedSessionIds };
}

// Every Pay period from the Payroll start through the running one, for the Pay periods list and
// the dashboard banner (summarizePeriods). Leaves out Clock corrections, which neither shows.
export function fetchPayPeriodsOverview(
  db: Db,
  now: Date,
): Promise<PayrollData> {
  const running = getPayPeriod(getBusinessDate(now));
  return fetchPayrollData(db, { from: PAYROLL_START, to: running.start });
}

const PAY_RATE_COLUMNS =
  "id, employee_id, hourly_rate_cents, effective_from, is_archived";

// Every live Pay rate in effect by `day`, for the Payroll export's current rates
// (buildPayrollExportModel picks each Cleaner's latest).
export function fetchPayRatesUpTo(db: Db, day: string): Promise<PayRateRow[]> {
  return readAllPages<PayRateRow>((from, to) =>
    db
      .from("pay_rates")
      .select(PAY_RATE_COLUMNS)
      .eq("is_archived", false)
      .lte("effective_from", day)
      .order("id", { ascending: true })
      .range(from, to),
  );
}

const MY_RUN_COLUMNS =
  "id, period_start, kind, paid_on, payout_method, total_cents";
const MY_LINE_COLUMNS =
  "id, pay_run_id, scheduled_date, client_name, minutes, rate_cents, amount_cents";
const MY_ADJUSTMENT_COLUMNS =
  "id, pay_run_id, amount_cents, reason, linked_scheduled_date, linked_client_name, created_at";

// The signed-in Cleaner's own paid Pay runs, their frozen lines and their Adjustments, for My pay
// (buildMyPay shapes them). The My pay views return only the caller's own paid rows, so no
// employee id is passed; an admin reads empty results.
export async function fetchMyPaidRuns(db: Db): Promise<{
  runs: MyPayRunRow[];
  lines: MyPayLineRow[];
  adjustments: MyPayAdjustmentRow[];
}> {
  const [runs, lines, adjustments] = await Promise.all([
    readAllPages<MyPayRunRow>((from, to) =>
      db
        .from("pay_runs_employee_view")
        .select(MY_RUN_COLUMNS)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAllPages<MyPayLineRow>((from, to) =>
      db
        .from("pay_run_lines_employee_view")
        .select(MY_LINE_COLUMNS)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAllPages<MyPayAdjustmentRow>((from, to) =>
      db
        .from("pay_adjustments_employee_view")
        .select(MY_ADJUSTMENT_COLUMNS)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  return { runs, lines, adjustments };
}
