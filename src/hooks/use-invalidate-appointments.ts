"use client";

import { useQueryClient } from "@tanstack/react-query";

import { APPOINTMENTS_KEY } from "@/lib/appointments/appointments-cache";

// Call after a mutation succeeds. Visible appointments queries refetch now; the others refetch
// the next time the screen shows them.
export function useInvalidateAppointments(): () => Promise<void> {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
}
