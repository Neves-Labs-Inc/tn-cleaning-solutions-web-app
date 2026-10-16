import { clsx, type ClassValue } from "clsx"
import { endOfMonth, format, startOfMonth } from 'date-fns'
import { twMerge } from "tailwind-merge"
import type { TimeSheetRecord } from "@/types/time-sheet-record"


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(hours: number, minutes: number): string {
  if (hours === 0 && minutes === 0) {
    return '0m'
  }

  if (hours === 0) {
    return `${minutes}m`
  }

  if (minutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${minutes}m`
}

export function compareRecords(left: TimeSheetRecord, right: TimeSheetRecord) {
  let result: number

  if (left.clocked_in_at === null && right.clocked_in_at === null) {
    result = 0
  } else if (left.clocked_in_at === null) {
    result = 1
  } else if (right.clocked_in_at === null) {
    result = -1
  } else {
    result = new Date(right.clocked_in_at).getTime() - new Date(left.clocked_in_at).getTime()
  }

  return result
}

export function parseMonth(month: string | string[] | undefined) {
  const firstValue = Array.isArray(month) ? month[0] : month
  if (!firstValue || !/^\d{4}-\d{2}$/.test(firstValue)) {
    return format(new Date(), 'yyyy-MM')
  }

  return firstValue
}