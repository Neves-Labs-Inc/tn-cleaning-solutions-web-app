import { formatDuration } from "@/lib/schedule/duration";

const MINUTES_PER_HOUR = 60;

export function formatMinutes(minutes: number): string {
  return formatDuration(
    Math.floor(minutes / MINUTES_PER_HOUR),
    minutes % MINUTES_PER_HOUR,
  );
}
