// Kept free of server-only imports so node --test can load it.
import { isInvoiceErrorCode, messageFor } from "../invoices/errors.ts";

// Postgres raise_exception: what triggers and functions use to refuse with a message meant for
// the admin (e.g. a visit on a paid invoice).
const RAISED_BY_SQL = "P0001";

export const GENERIC_APPOINTMENT_ERROR = "Something went wrong. Try again.";

// Covers PostgREST errors and Supabase auth errors alike. invoice_error puts its code in `details`.
export type DatabaseLikeError = {
  message: string;
  code?: string;
  details?: string | null;
};

// Anything not raised on purpose may leak schema details, so it is logged and replaced.
export function toAppointmentErrorMessage(
  error: DatabaseLikeError,
  operation: string,
): string {
  if (error.code === RAISED_BY_SQL) {
    // invoice_error's SQL text still says "visit"; the TS mirror carries the current wording.
    return isInvoiceErrorCode(error.details)
      ? messageFor(error.details)
      : error.message;
  }

  // Only code and message: PostgREST's details can echo row values (client names) into the logs.
  console.error(`${operation}: unexpected database error`, {
    code: error.code,
    message: error.message,
  });
  return GENERIC_APPOINTMENT_ERROR;
}
