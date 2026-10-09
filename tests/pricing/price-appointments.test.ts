import assert from 'node:assert/strict'
import { test } from 'node:test'

import { priceAppointments, type PriceableAppointment } from '../../src/lib/pricing/index.ts'
import { createFakeDb, type FakeTables } from './fake-db.ts'

const CLIENT_ID = 'client-1'
const JOB_ID = 'job-1'

// 09:00-11:30 is 150 minutes; at the $45/h Job rate that is $112.50.
function appointment(overrides: Partial<PriceableAppointment> = {}): PriceableAppointment {
  return {
    id: 'appt-1',
    client_id: CLIENT_ID,
    job_id: JOB_ID,
    scheduled_date: '2026-10-01',
    scheduled_start_time: '09:00:00',
    scheduled_end_time: '11:30:00',
    price_override_cents: null,
    pricing_job: { hourly_rate_cents: 4500 },
    ...overrides,
  }
}

function clientRule(effectiveFrom: string, hourlyRateCents: number, isArchived = false) {
  return {
    client_id: CLIENT_ID,
    job_id: JOB_ID,
    hourly_rate_cents: hourlyRateCents,
    effective_from: effectiveFrom,
    is_archived: isArchived,
  }
}

function cleaner(appointmentId: string, isArchived = false) {
  return { appointment_id: appointmentId, is_archived: isArchived }
}

async function priceOne(row: PriceableAppointment, tables: FakeTables = {}) {
  const { db } = createFakeDb(tables)
  const priced = await priceAppointments(db, [row])
  const result = priced.get(row.id)
  assert.ok(result, `no price returned for ${row.id}`)
  return result
}

test('a visit with no client rate is priced at the Job rate', async () => {
  const { live } = await priceOne(appointment())

  assert.deepEqual(live, {
    source: 'job',
    amount_cents: 11250,
    rate_cents: 4500,
    minutes: 150,
    headcount: 1,
  })
})

test("the client's negotiated rate effective on the scheduled date wins over the Job rate", async () => {
  const { live } = await priceOne(appointment(), {
    client_job_pricing: [
      clientRule('2026-01-01', 3000),
      clientRule('2026-06-01', 3800),
      clientRule('2026-09-01', 9900, true),
      clientRule('2026-10-02', 5000),
    ],
  })

  assert.deepEqual(live, {
    source: 'client_job_pricing',
    amount_cents: 9500,
    rate_cents: 3800,
    minutes: 150,
    headcount: 1,
  })
})

test('an appointment override wins over both rates and carries no rate or minutes', async () => {
  const { live } = await priceOne(appointment({ price_override_cents: 20000 }), {
    client_job_pricing: [clientRule('2026-01-01', 3800)],
  })

  assert.deepEqual(live, {
    source: 'appointment_override',
    amount_cents: 20000,
    rate_cents: null,
    minutes: null,
    headcount: 1,
  })
})

test('a visit with no Cleaners assigned is billed once', async () => {
  const { live } = await priceOne(appointment(), { appointment_employees: [] })

  assert.deepEqual(live, { source: 'job', amount_cents: 11250, rate_cents: 4500, minutes: 150, headcount: 1 })
})

test('a visit with one Cleaner is billed once', async () => {
  const { live } = await priceOne(appointment(), { appointment_employees: [cleaner('appt-1')] })

  assert.deepEqual(live, { source: 'job', amount_cents: 11250, rate_cents: 4500, minutes: 150, headcount: 1 })
})

test('an hourly price is multiplied by the number of Cleaners', async () => {
  const { live } = await priceOne(appointment(), {
    appointment_employees: [cleaner('appt-1'), cleaner('appt-1'), cleaner('appt-1'), cleaner('appt-2')],
  })

  assert.deepEqual(live, { source: 'job', amount_cents: 33750, rate_cents: 4500, minutes: 150, headcount: 3 })
})

test('a client rate is multiplied by the number of Cleaners too', async () => {
  const { live } = await priceOne(appointment(), {
    client_job_pricing: [clientRule('2026-01-01', 3800)],
    appointment_employees: [cleaner('appt-1'), cleaner('appt-1')],
  })

  assert.deepEqual(live, {
    source: 'client_job_pricing',
    amount_cents: 19000,
    rate_cents: 3800,
    minutes: 150,
    headcount: 2,
  })
})

test('an archived assignment does not count as a Cleaner', async () => {
  const { live } = await priceOne(appointment(), {
    appointment_employees: [cleaner('appt-1'), cleaner('appt-1', true), cleaner('appt-1', true)],
  })

  assert.deepEqual(live, { source: 'job', amount_cents: 11250, rate_cents: 4500, minutes: 150, headcount: 1 })
})

test('an assignment with no archived flag counts as a Cleaner', async () => {
  const { live } = await priceOne(appointment(), {
    appointment_employees: [cleaner('appt-1'), { appointment_id: 'appt-1', is_archived: null }],
  })

  assert.deepEqual(live, { source: 'job', amount_cents: 22500, rate_cents: 4500, minutes: 150, headcount: 2 })
})

test('an appointment override is not multiplied by the number of Cleaners', async () => {
  const { live } = await priceOne(appointment({ price_override_cents: 20000 }), {
    appointment_employees: [cleaner('appt-1'), cleaner('appt-1'), cleaner('appt-1')],
  })

  assert.deepEqual(live, {
    source: 'appointment_override',
    amount_cents: 20000,
    rate_cents: null,
    minutes: null,
    headcount: 3,
  })
})

test('a visit with no Job is Unpriced, never $0', async () => {
  const priced = await priceOne(appointment({ pricing_job: null, price_override_cents: 20000 }), {
    appointment_employees: [cleaner('appt-1')],
  })

  assert.deepEqual(priced, { live: { source: 'unpriced' }, display: { source: 'unpriced' } })
})

test('display is the Live price when the visit has no live invoice line', async () => {
  const { live, display } = await priceOne(appointment(), {
    invoice_appointments: [{ appointment_id: 'appt-1', billed_amount_cents: 9999, is_archived: true }],
  })

  assert.deepEqual(display, live)
})

test("display is the Billed amount from the visit's live invoice line", async () => {
  const { live, display } = await priceOne(appointment(), {
    invoice_appointments: [
      { appointment_id: 'appt-1', billed_amount_cents: 9999, is_archived: true },
      { appointment_id: 'appt-1', billed_amount_cents: 10000, is_archived: false },
    ],
  })

  assert.deepEqual(display, { source: 'billed', amount_cents: 10000 })
  assert.deepEqual(live, { source: 'job', amount_cents: 11250, rate_cents: 4500, minutes: 150, headcount: 1 })
})

test('a live invoice line with no Billed amount leaves display on the Live price', async () => {
  const { live, display } = await priceOne(appointment(), {
    invoice_appointments: [{ appointment_id: 'appt-1', billed_amount_cents: null, is_archived: false }],
  })

  assert.deepEqual(display, live)
})

test('pricing many visits makes one query per lookup', async () => {
  const rows = ['appt-1', 'appt-2', 'appt-3'].map((id) => appointment({ id }))
  const { db, queriesByTable } = createFakeDb({
    appointment_employees: [cleaner('appt-2'), cleaner('appt-2')],
    invoice_appointments: [{ appointment_id: 'appt-3', billed_amount_cents: 5000, is_archived: false }],
  })

  const priced = await priceAppointments(db, rows)

  assert.deepEqual(priced.get('appt-1')?.display, {
    source: 'job',
    amount_cents: 11250,
    rate_cents: 4500,
    minutes: 150,
    headcount: 1,
  })
  assert.deepEqual(priced.get('appt-2')?.display, {
    source: 'job',
    amount_cents: 22500,
    rate_cents: 4500,
    minutes: 150,
    headcount: 2,
  })
  assert.deepEqual(priced.get('appt-3')?.display, { source: 'billed', amount_cents: 5000 })
  assert.deepEqual(Object.fromEntries(queriesByTable), {
    client_job_pricing: 1,
    invoice_appointments: 1,
    appointment_employees: 1,
  })
})

test('pricing no visits returns an empty map', async () => {
  const { db } = createFakeDb({})

  assert.equal((await priceAppointments(db, [])).size, 0)
})
