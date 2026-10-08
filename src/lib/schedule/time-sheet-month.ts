import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns'

export type TimeSheetMonth = {
  year: number
  month: number
  start: string
  end: string
  label: string
  prevParam: string
  nextParam: string | null
}

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/
// Years before this are typos (e.g. 0026), not real time sheets.
const MIN_YEAR = 2000
const DAY_FORMAT = 'yyyy-MM-dd'
const PARAM_FORMAT = 'yyyy-MM'

export function resolveTimeSheetMonth(param: string | string[] | undefined, now: Date): TimeSheetMonth {
  const raw = Array.isArray(param) ? param[0] : param
  const currentMonthStart = startOfMonth(now)

  let monthStart = currentMonthStart
  if (raw !== undefined && MONTH_PARAM.test(raw)) {
    const [year, month] = raw.split('-').map(Number)
    const requested = new Date(year, month - 1, 1)
    if (year >= MIN_YEAR && requested <= currentMonthStart) {
      monthStart = requested
    }
  }

  const isCurrentMonth = monthStart.getTime() === currentMonthStart.getTime()
  return {
    year: monthStart.getFullYear(),
    month: monthStart.getMonth() + 1,
    start: format(monthStart, DAY_FORMAT),
    end: format(endOfMonth(monthStart), DAY_FORMAT),
    label: format(monthStart, 'MMMM yyyy'),
    prevParam: format(addMonths(monthStart, -1), PARAM_FORMAT),
    nextParam: isCurrentMonth ? null : format(addMonths(monthStart, 1), PARAM_FORMAT),
  }
}
