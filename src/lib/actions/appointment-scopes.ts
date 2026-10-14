"use server";

import type { AppointmentScope, ScopeAction } from "@/lib/appointments/appointment-scope";
import {
  toAppointmentErrorMessage,
  type DatabaseLikeError,
} from "@/lib/appointments/errors";
import { previewScope } from "@/lib/appointments/scope-changes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ScopePreviewData = {
  visitCount: number;
  actCount: number;
  skippedCount: number;
  chosenDate: string;
  seriesId: string | null;
};

export type ScopePreviewResult =
  | { success: true; data: ScopePreviewData }
  | { success: false; error: string };

const SCOPES: readonly AppointmentScope[] = ["occurrence", "future", "series"];
const ACTIONS: readonly ScopeAction[] = ["cancel", "delete"];

// Same check as appointments.ts; duplicated so this file stays clear of that one's parallel work.
async function requireAdminRole(): Promise<
  { success: true } | { success: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return {
      success: false,
      error: toAppointmentErrorMessage(error, "requireAdminRole"),
    };
  }
  if (!user) return { success: false, error: "Not authenticated" };
  if (user.app_metadata?.role !== "admin") {
    return { success: false, error: "Unauthorized" };
  }
  return { success: true };
}

// The confirm dialog's live preview: how many visits a scoped cancel or delete would touch and
// skip. Reads only; the write re-checks under lock.
export async function previewAppointmentScope(
  appointmentId: string,
  scope: AppointmentScope,
  action: ScopeAction,
): Promise<ScopePreviewResult> {
  const authResult = await requireAdminRole();
  if (!authResult.success) return authResult;

  if (!appointmentId) {
    return { success: false, error: "Appointment id is required." };
  }
  // Server actions take whatever the client sends, so the unions are checked at runtime.
  if (!SCOPES.includes(scope) || !ACTIONS.includes(action)) {
    return { success: false, error: "Invalid scope." };
  }

  let result: ScopePreviewResult;
  try {
    const preview = await previewScope(createAdminClient(), {
      appointmentId,
      scope,
      action,
    });
    result =
      preview.error === null
        ? {
            success: true,
            data: {
              visitCount: preview.value.visitCount,
              actCount: preview.value.actCount,
              skippedCount: preview.value.skipped.length,
              chosenDate: preview.value.chosenDate,
              seriesId: preview.value.seriesId,
            },
          }
        : { success: false, error: preview.error };
  } catch (error) {
    // The core throws PostgREST errors as-is; anything unexpected is logged and replaced there.
    result = {
      success: false,
      error: toAppointmentErrorMessage(
        error as DatabaseLikeError,
        "previewAppointmentScope",
      ),
    };
  }
  return result;
}
