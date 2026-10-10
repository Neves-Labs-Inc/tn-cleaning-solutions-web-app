// Relative imports: node --test runs this file without the @/ alias.
import { toSessionRowView, type SessionRowView } from "./drilldown-days.ts";
import {
  buildSessionView,
  type AppointmentCrewRow,
  type SessionView,
} from "./session-view.ts";

// One Cleaner on the admin appointment page: her session, cut down for the client, plus who she
// is and the admin notes.
export type CrewMemberView = {
  session: SessionRowView;
  name: string;
  phone: string | null;
  adminNotes: string;
};

// A cancelled visit never flags, and the server refuses its corrections (visit_cancelled).
function toCrewSession(row: AppointmentCrewRow, now: Date): SessionView {
  const view = buildSessionView(row, now);
  if (row.appointment.status !== "cancelled") return view;

  return { ...view, flags: [], fixAction: null };
}

// Alphabetical by name, so the list reads the same on every refresh.
export function buildCrewViews(
  rows: AppointmentCrewRow[],
  now: Date,
): CrewMemberView[] {
  return rows
    .map((row) => ({
      session: toSessionRowView(toCrewSession(row, now)),
      name: row.employee.full_name,
      phone: row.employee.phone,
      // The column is nullable; a NULL would leave the textarea uncontrolled.
      adminNotes: row.admin_notes ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
