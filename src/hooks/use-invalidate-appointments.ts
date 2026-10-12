"use client";

import { useQueryClient } from "@tanstack/react-query";

import { discardAppointments } from "@/lib/appointments/discard-appointments";

// Call after a change to appointments. Appointments queries no screen is using lose their data,
// so the next view shows the skeleton, never old rows. The ones the mounted screen is using
// refetch in place, keeping their rows until the fresh ones land.
export function useInvalidateAppointments(): () => Promise<void> {
  const queryClient = useQueryClient();

  return () => discardAppointments(queryClient);
}
