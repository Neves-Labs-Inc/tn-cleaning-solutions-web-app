"use server";

import { revalidatePath } from "next/cache";

import type { AppointmentScope, ScopeAction } from "@/lib/appointments/appointment-scope";
import {
  toAppointmentErrorMessage,
  type DatabaseLikeError,
} from "@/lib/appointments/errors";
import { deleteInScope, previewScope } from "@/lib/appointments/scope-changes";
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

export type DeleteAppointmentsData = {
  id: string;
  ids: string[];
  deletedCount: number;
  skippedCount: number;
  chosenDeleted: boolean;
};

export type DeleteAppointmentsResult =
  | { success: true; data: DeleteAppointmentsData }
  | { success: false; error: string };

const APPOINTMENTS_PATH = "/solutions/appointments";
const INVOICES_PATH = "/solutions/invoices";
// A deleted visit's clocks leave the admin and Cleaner time sheets.
const TIME_SHEET_PATHS = ["/solutions/time-tracking", "/solutions/time-sheets"];

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

// Ids come back from the database, never free text.
function revalidateDeleted(deletedIds: string[], invoiceIds: string[]): void {
  revalidatePath(APPOINTMENTS_PATH);
  for (const id of deletedIds) {
    revalidatePath(`${APPOINTMENTS_PATH}/${id}`);
  }
  if (invoiceIds.length > 0) revalidatePath(INVOICES_PATH);
  for (const id of invoiceIds) {
    revalidatePath(`${INVOICES_PATH}/${id}`);
  }
  for (const path of TIME_SHEET_PATHS) {
    revalidatePath(path);
  }
}

// Permanently deletes the visits in scope; the ones on a paid invoice are skipped.
export async function deleteAppointments(
  appointmentId: string,
  scope: AppointmentScope,
): Promise<DeleteAppointmentsResult> {
  const authResult = await requireAdminRole();
  if (!authResult.success) return authResult;

  if (!appointmentId) {
    return { success: false, error: "Appointment id is required." };
  }
  // Server actions take whatever the client sends, so the union is checked at runtime.
  if (!SCOPES.includes(scope)) {
    return { success: false, error: "Invalid scope." };
  }

  let result: DeleteAppointmentsResult;
  try {
    // The session client, not the admin one: delete_appointments checks the caller is an admin.
    const deleted = await deleteInScope(await createClient(), {
      appointmentId,
      scope,
    });
    if (deleted.error === null) {
      const { deletedIds, skipped, invoiceIds, chosenDeleted } = deleted.value;
      revalidateDeleted(deletedIds, invoiceIds);
      result = {
        success: true,
        data: {
          id: appointmentId,
          ids: deletedIds,
          deletedCount: deletedIds.length,
          skippedCount: skipped.length,
          chosenDeleted,
        },
      };
    } else {
      console.warn("deleteAppointments: nothing deleted", {
        appointmentId,
        scope,
        error: deleted.error,
      });
      result = { success: false, error: deleted.error };
    }
  } catch (error) {
    // The core throws PostgREST errors as-is; anything unexpected is logged and replaced there.
    result = {
      success: false,
      error: toAppointmentErrorMessage(
        error as DatabaseLikeError,
        "deleteAppointments",
      ),
    };
  }
  return result;
}
