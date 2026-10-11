import type { AppointmentStatus } from "./lifecycle.ts";

// An existing appointment_employees row as the crew planner sees it.
export type ExistingAssignment = {
  id: string;
  employee_id: string;
  // NULL counts as live, matching the SQL's coalesce(is_archived, false).
  is_archived: boolean | null;
  hasHistory: boolean;
  hasClockIn: boolean;
};

export type CrewAppointment = {
  status: AppointmentStatus;
  manually_completed: boolean;
};

export type CrewChangePlan = {
  archiveIds: string[];
  deleteIds: string[];
  insertEmployeeIds: string[];
  // Must be written before any archive or delete so the status never leaves completed.
  shouldTurnOnManualCompletion: boolean;
};

// Hours records must survive 6 years (Ontario ESA, CRA), so a removed Cleaner
// with any session history is archived instead of deleted. Archived rows are
// history only: they never count as assigned and are never unarchived.
// A completed appointment left with no clocked Cleaner would derive back to
// scheduled, so it becomes a Manual completion instead.
export function planCrewChange(
  existingRows: ExistingAssignment[],
  submittedEmployeeIds: string[],
  appointment: CrewAppointment,
): CrewChangePlan {
  const submitted = new Set(submittedEmployeeIds);
  const liveRows = existingRows.filter((row) => row.is_archived !== true);
  const removedRows = liveRows.filter((row) => !submitted.has(row.employee_id));
  const liveEmployeeIds = new Set(liveRows.map((row) => row.employee_id));
  const isClockedCrewLeft = liveRows.some(
    (row) => row.hasClockIn && submitted.has(row.employee_id),
  );

  return {
    archiveIds: removedRows.filter((row) => row.hasHistory).map((row) => row.id),
    deleteIds: removedRows.filter((row) => !row.hasHistory).map((row) => row.id),
    insertEmployeeIds: [...submitted].filter(
      (employeeId) => !liveEmployeeIds.has(employeeId),
    ),
    shouldTurnOnManualCompletion:
      appointment.status === "completed" &&
      !appointment.manually_completed &&
      !isClockedCrewLeft,
  };
}

export type SessionHistoryFacts = {
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  correctionCount: number;
  acknowledgementCount: number;
};

// A correction can clear both clocks, so the audit rows count as history even
// when the session itself looks untouched.
export function hasSessionHistory(facts: SessionHistoryFacts): boolean {
  return (
    facts.clocked_in_at !== null ||
    facts.clocked_out_at !== null ||
    facts.correctionCount > 0 ||
    facts.acknowledgementCount > 0
  );
}

// A later appointment in a series, as a "this and following" edit sees it.
// assignments covers every row, archived or not.
export type FutureVisit = {
  id: string;
  scheduled_date: string;
  status: AppointmentStatus;
  manually_completed: boolean;
  hasLiveClaim: boolean;
  assignments: SessionHistoryFacts[];
};

export type FutureVisitCleanupPlan = {
  deleteIds: string[];
  // Dates that keep their existing appointment, so they mustn't be regenerated.
  preservedDates: string[];
};

// A Series edit never deletes a Protected appointment (CONTEXT.md): deleting one on a Live claim
// would cascade its line off the invoice, and no hours record is ever deleted.
function isProtected(visit: FutureVisit): boolean {
  return (
    visit.status !== "scheduled" ||
    visit.manually_completed ||
    visit.hasLiveClaim ||
    visit.assignments.some(hasSessionHistory)
  );
}

export function planFutureVisitCleanup(
  visits: FutureVisit[],
): FutureVisitCleanupPlan {
  return {
    deleteIds: visits
      .filter((visit) => !isProtected(visit))
      .map((visit) => visit.id),
    preservedDates: visits
      .filter(isProtected)
      .map((visit) => visit.scheduled_date),
  };
}
