import { durationMinutes, hourlyAmountCents } from './money.ts'
import { pickEffectiveRule, type ClientJobRule } from './resolve.ts'

type EstimateInput = {
  jobRateCents: number | null
  clientRules: ClientJobRule[]
  date: string | null
  startTime: string | null
  endTime: string | null
  cleaners: number
  overrideCents: number | null
}

export type AppointmentEstimate =
  | { kind: 'incomplete' }
  | {
      kind: 'calculated'
      rateCents: number
      minutes: number
      cleaners: number
      amountCents: number
      rateSource: 'job' | 'client_job_pricing'
      overrideCents: number | null
    }

// Same floor as livePrice: a visit with no crew assigned is still billed once.
const MIN_HEADCOUNT = 1

// The appointment form's preview of the hourly price the save will bill.
export function estimateAppointmentTotal(input: EstimateInput): AppointmentEstimate {
  const { jobRateCents, clientRules, date, startTime, endTime, cleaners, overrideCents } = input
  if (jobRateCents === null || !startTime || !endTime) return { kind: 'incomplete' }

  const minutes = durationMinutes(startTime, endTime)
  // NaN (a malformed time) fails this too.
  if (!(minutes > 0)) return { kind: 'incomplete' }

  // Without a date no rule can be in effect yet, so the Job rate stands until one is picked.
  const rule = date ? pickEffectiveRule(clientRules, date) : null
  const rateCents = rule?.hourly_rate_cents ?? jobRateCents
  const headcount = Math.max(cleaners, MIN_HEADCOUNT)

  return {
    kind: 'calculated',
    rateCents,
    minutes,
    cleaners: headcount,
    amountCents: hourlyAmountCents(rateCents, minutes) * headcount,
    rateSource: rule === null ? 'job' : 'client_job_pricing',
    overrideCents,
  }
}
