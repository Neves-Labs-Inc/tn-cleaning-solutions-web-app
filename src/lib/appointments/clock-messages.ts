// Shared by the Cleaner's clock notice and the server refusal, so the client can tell a refusal that
// the standing notice already explains. Not in the 'use server' actions file: that can only export async functions.
export const CLOCK_BLOCKED_MESSAGES = {
  cancelled: 'This appointment was cancelled.',
  manuallyCompleted: 'An admin marked this appointment complete.',
} as const
