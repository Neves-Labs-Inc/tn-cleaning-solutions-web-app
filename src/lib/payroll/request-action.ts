import { toast } from "sonner";

import { UNKNOWN_PAYROLL_MESSAGE } from "@/lib/payroll/errors";

// Calls a Payroll server action from the page. A server action rejects on a dropped connection or
// a deploy that replaced it; that's logged and shown as toast.error, and the caller gets null so
// it can return its control to idle instead of crashing to the route's error boundary.
export async function requestAction<T>(
  operation: string,
  call: () => Promise<T>,
): Promise<T | null> {
  let result: T | null = null;
  try {
    result = await call();
  } catch (cause) {
    console.error(`payroll: ${operation} request failed`, cause);
    toast.error(UNKNOWN_PAYROLL_MESSAGE);
  }
  return result;
}
