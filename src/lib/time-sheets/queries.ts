import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import type { TimeSheetRecord } from "@/types/time-sheet-record";
import type { DayRange } from "./range.ts";
import type { AdminSessionRow } from "./session-view.ts";
import type { TimeSheetMonth } from "./time-sheet-month.ts";

// Time-sheet reads. Each takes the user-session client and throws on a failed read, to the
// route's error boundary. No `server-only` import, so node:test can load this file; call these
// from server code only.
//
// Every read leaves out archived assignments (NULL counts as live), archived visits and
// cancelled visits, and filters dates in the query on the embedded visit.

type Db = SupabaseClient<Database>;
type PageResult = { data: unknown; error: unknown };
type PageQuery = (from: number, to: number) => PromiseLike<PageResult>;

// PostgREST caps a response at its max-rows setting, so reads page until a short page comes back.
const PAGE_SIZE = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ADMIN_SESSION_COLUMNS = `
  id, employee_id, clocked_in_at, clocked_out_at,
  appointment:appointments!inner (
    id, scheduled_date, scheduled_start_time, scheduled_end_time, status, manually_completed,
    client:clients ( name ),
    job:jobs ( name )
  ),
  employee:employees!inner ( id, full_name ),
  clock_corrections ( * ),
  odd_duration_acknowledgements ( * )
`;

const CLEANER_SESSION_COLUMNS = `
  id, clocked_in_at, clocked_out_at,
  appointments:appointments_employee_view!inner (
    scheduled_date,
    clients!inner ( name ),
    jobs:jobs_employee_view!inner ( name )
  )
`;

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

// The admin Time sheet: every live session whose visit falls in the range, optionally for one
// Cleaner, with its corrections and acknowledgements. Admin pages only. `cleanerId` usually comes
// from the URL: one that isn't a UUID matches no Cleaner, so it returns no sessions instead of
// Postgres refusing the cast (22P02).
export async function fetchAdminSessions(
  db: Db,
  range: DayRange,
  cleanerId?: string,
): Promise<AdminSessionRow[]> {
  // A blank `?cleaner=` means no Cleaner was picked: no filter.
  const cleaner = cleanerId?.trim() || null;
  if (cleaner !== null && !UUID_PATTERN.test(cleaner)) return [];

  return readAllPages<AdminSessionRow>((from, to) => {
    let query = db
      .from("appointment_employees")
      .select(ADMIN_SESSION_COLUMNS)
      .not("is_archived", "is", true)
      .eq("appointment.is_archived", false)
      .neq("appointment.status", "cancelled")
      .gte("appointment.scheduled_date", range.from)
      .lte("appointment.scheduled_date", range.to);
    if (cleaner !== null) {
      query = query.eq("employee_id", cleaner);
    }
    return query.order("id", { ascending: true }).range(from, to);
  });
}

// The Cleaner's own month: her clocked sessions, read through the employee views.
// `employeeId` must be the signed-in Cleaner's own id, looked up from the authenticated session,
// never taken from a URL or form: the employee view also returns teammates' rows on shared
// visits, so the id is what keeps her from reading co-workers' clocks.
export async function fetchCleanerSessions(
  db: Db,
  employeeId: string,
  month: Pick<TimeSheetMonth, "start" | "end">,
): Promise<TimeSheetRecord[]> {
  return readAllPages<TimeSheetRecord>((from, to) =>
    db
      .from("appointment_employees_employee_view")
      .select(CLEANER_SESSION_COLUMNS)
      .eq("employee_id", employeeId)
      .not("clocked_in_at", "is", null)
      .not("is_archived", "is", true)
      .not("appointments.is_archived", "is", true)
      .neq("appointments.status", "cancelled")
      .gte("appointments.scheduled_date", month.start)
      .lte("appointments.scheduled_date", month.end)
      .order("id", { ascending: true })
      .range(from, to),
  );
}
