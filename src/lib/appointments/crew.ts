// An existing appointment_employees row as the crew planner sees it.
export type ExistingAssignment = {
  id: string;
  employee_id: string;
  // NULL counts as live, matching the SQL's coalesce(is_archived, false).
  is_archived: boolean | null;
  hasHistory: boolean;
};

export type CrewChangePlan = {
  archiveIds: string[];
  deleteIds: string[];
  insertEmployeeIds: string[];
};

// Hours records must survive 6 years (Ontario ESA, CRA), so a removed Cleaner
// with any session history is archived instead of deleted. Archived rows are
// history only: they never count as assigned and are never unarchived.
export function planCrewChange(
  existingRows: ExistingAssignment[],
  submittedEmployeeIds: string[],
): CrewChangePlan {
  const submitted = new Set(submittedEmployeeIds);
  const liveRows = existingRows.filter((row) => row.is_archived !== true);
  const removedRows = liveRows.filter((row) => !submitted.has(row.employee_id));
  const liveEmployeeIds = new Set(liveRows.map((row) => row.employee_id));

  return {
    archiveIds: removedRows.filter((row) => row.hasHistory).map((row) => row.id),
    deleteIds: removedRows.filter((row) => !row.hasHistory).map((row) => row.id),
    insertEmployeeIds: [...submitted].filter(
      (employeeId) => !liveEmployeeIds.has(employeeId),
    ),
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

// A later scheduled visit in a series, as a "this and future" edit sees it.
// assignments covers every row, archived or not.
export type FutureVisit = {
  id: string;
  scheduled_date: string;
  assignments: SessionHistoryFacts[];
};

export type FutureVisitCleanupPlan = {
  deleteIds: string[];
  // Dates that keep their existing visit, so they mustn't be regenerated.
  preservedDates: string[];
};

// No hours record is ever deleted: a visit where any assignment (archived or
// not) has history stays put, like a completed or cancelled one.
export function planFutureVisitCleanup(
  visits: FutureVisit[],
): FutureVisitCleanupPlan {
  const isPreserved = (visit: FutureVisit): boolean =>
    visit.assignments.some(hasSessionHistory);

  return {
    deleteIds: visits
      .filter((visit) => !isPreserved(visit))
      .map((visit) => visit.id),
    preservedDates: visits
      .filter(isPreserved)
      .map((visit) => visit.scheduled_date),
  };
}
