// Kept free of server-only imports so node --test can load it.

// Postgres raise_exception: what triggers and functions use to refuse with a message meant for
// the admin (e.g. a visit on a paid invoice).
const RAISED_BY_SQL = "P0001";

export const GENERIC_APPOINTMENT_ERROR = "Something went wrong. Try again.";

// Covers PostgREST errors and Supabase auth errors alike.
export type DatabaseLikeError = { message: string; code?: string };

// Anything not raised on purpose may leak schema details, so it is logged and replaced.
export function toAppointmentErrorMessage(
  error: DatabaseLikeError,
  operation: string,
): string {
  if (error.code === RAISED_BY_SQL) return error.message;

  // Only code and message: PostgREST's details can echo row values (client names) into the logs.
  console.error(`${operation}: unexpected database error`, {
    code: error.code,
    message: error.message,
  });
  return GENERIC_APPOINTMENT_ERROR;
}
