const MS_PER_MINUTE = 60 * 1000;

function toEpochMinute(clock: string): number {
  return Math.floor(Date.parse(clock) / MS_PER_MINUTE);
}

// Whole minutes between two clocks as displayed (seconds dropped), never negative.
export function getClockedMinutes(clockIn: string, clockOut: string): number {
  return Math.max(0, toEpochMinute(clockOut) - toEpochMinute(clockIn));
}
