"use client";

import { useQueryClient, type QueryKey } from "@tanstack/react-query";

import { loadAppointmentChanges } from "@/lib/actions/appointments-screen";
import {
  refreshAppointments,
  renameInAppointments,
  updateAppointmentsCache,
  type NameChange,
} from "@/lib/appointments/patch-appointments";

export type AppointmentsCache = {
  // Patches the changed appointments into the cache; resolves once it's updated. A failed read
  // discards the appointments cache instead, so pre-change rows never show.
  applyChanges: (ids: string[]) => Promise<void>;
  rename: (change: NameChange) => void;
  // Marks queries stale, keeping their rows; no keys means every appointments query.
  refresh: (keys?: QueryKey[]) => Promise<void>;
};

// Call after a change to appointments, with what changed, so the list updates in place.
export function useAppointmentsCache(): AppointmentsCache {
  const queryClient = useQueryClient();

  return {
    // Arrow wrapper, so only the ids reach the server action.
    applyChanges: (ids) =>
      updateAppointmentsCache(queryClient, ids, (changedIds) =>
        loadAppointmentChanges(changedIds),
      ),
    rename: (change) => renameInAppointments(queryClient, change),
    refresh: (keys) => refreshAppointments(queryClient, keys),
  };
}
