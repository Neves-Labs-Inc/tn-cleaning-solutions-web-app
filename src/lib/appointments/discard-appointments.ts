import type { QueryClient } from "@tanstack/react-query";

import { APPOINTMENTS_KEY } from "./appointments-keys.ts";

// The fallback when patching in place fails (updateAppointmentsCache), since the rows can no
// longer be trusted. Drops everything the change may have made stale. Queries no screen is using lose their data, so the next view
// shows the skeleton instead of old rows. Reset rather than removed, so a mounted but disabled
// observer (payment methods) keeps its query. Queries the screen is using refetch in place and
// keep their rows until the fresh ones land, so a list the admin is acting on never blanks.
export async function discardAppointments(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.resetQueries({ queryKey: APPOINTMENTS_KEY, type: "inactive" }),
    queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY, type: "active" }),
  ]);
}
