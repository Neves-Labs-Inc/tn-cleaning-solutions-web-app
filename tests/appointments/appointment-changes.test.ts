import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listAppointmentChanges } from "../../src/lib/appointments/appointment-changes.ts";
import { createFakeSupabase } from "../invoices/fake-supabase.ts";

const JOB_RATE_CENTS = 4000;
// 08:00 Eastern on Oct 11.
const NOW = new Date("2026-10-11T12:00:00Z");

type AppointmentSeed = {
  id: string;
  date?: string;
  start?: string;
  end?: string;
  status?: string;
  completedAt?: string | null;
  isArchived?: boolean;
  live?: Array<{ is_archived: boolean; cancelled_at: string | null }>;
};

// One row every read can load: the schedule, Needs billing and Needs completion.
function appointment(seed: AppointmentSeed) {
  const status = seed.status ?? "scheduled";
  return {
    id: seed.id,
    client_id: "smith",
    job_id: "standard",
    scheduled_date: seed.date ?? "2026-10-07",
    scheduled_start_time: seed.start ?? "09:00:00",
    scheduled_end_time: seed.end ?? "12:00:00",
    price_override_cents: null,
    pricing_job: { hourly_rate_cents: JOB_RATE_CENTS },
    status,
    manually_completed: false,
    completed_at:
      seed.completedAt === undefined
        ? status === "completed"
          ? "2026-10-07T16:00:00Z"
          : null
        : seed.completedAt,
    is_archived: seed.isArchived ?? false,
    clients: { name: "Maria Silva" },
    jobs: { name: "Standard clean" },
    live: seed.live ?? [],
  };
}

const PAID = { id: "inv-paid", status: "paid", invoice_number: "INV-002-SMI2026" };

function paidLine(appointmentId: string) {
  return {
    appointment_id: appointmentId,
    invoice_id: PAID.id,
    billed_amount_cents: 9900,
    is_archived: false,
    cancelled_at: null,
    invoice: PAID,
  };
}

const LIVE_LINE = [{ is_archived: false, cancelled_at: null }];

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

describe("listAppointmentChanges", () => {
  it("returns schedule rows for only the given ids, with the week read's price and Payment state", async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: "asked-paid", status: "completed", live: LIVE_LINE }),
        appointment({ id: "not-asked", status: "completed" }),
      ],
      invoice_appointments: [paidLine("asked-paid")],
    });

    const changes = await listAppointmentChanges(db, ["asked-paid"], NOW);

    assert.deepEqual(changes.ids, ["asked-paid"]);
    assert.deepEqual(changes.schedule, [
      {
        id: "asked-paid",
        clientId: "smith",
        clientName: "Maria Silva",
        jobId: "standard",
        jobName: "Standard clean",
        scheduledDate: "2026-10-07",
        startTime: "09:00:00",
        endTime: "12:00:00",
        status: "completed",
        priceCents: 9900,
        paymentState: "paid",
        claim: { id: "inv-paid", number: "INV-002-SMI2026", status: "paid" },
        isNotClocked: false,
        isMissedClock: false,
      },
    ]);
    assert.deepEqual(changes.needsBilling, []);
    assert.deepEqual(changes.needsCompletion, []);
  });

  it("puts an id in Needs billing or Needs completion only when it belongs there", async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: "unbilled", status: "completed" }),
        appointment({ id: "not-clocked", date: "2026-09-30" }),
        appointment({ id: "upcoming", date: "2026-10-20" }),
        appointment({ id: "other-unbilled", status: "completed" }),
        appointment({ id: "other-not-clocked", date: "2026-09-30" }),
      ],
    });

    const changes = await listAppointmentChanges(
      db,
      ["unbilled", "not-clocked", "upcoming"],
      NOW,
    );

    assert.deepEqual(ids(changes.schedule), ["not-clocked", "unbilled", "upcoming"]);
    assert.deepEqual(changes.needsBilling, [
      {
        id: "unbilled",
        clientId: "smith",
        clientName: "Maria Silva",
        scheduledDate: "2026-10-07",
        startTime: "09:00:00",
        endTime: "12:00:00",
        jobId: "standard",
        jobName: "Standard clean",
        livePriceCents: 12000,
      },
    ]);
    assert.deepEqual(changes.needsCompletion, [
      {
        id: "not-clocked",
        clientId: "smith",
        clientName: "Maria Silva",
        jobId: "standard",
        jobName: "Standard clean",
        scheduledDate: "2026-09-30",
        startTime: "09:00:00",
        endTime: "12:00:00",
        priceCents: 12000,
      },
    ]);
  });

  it("returns no rows for a deleted or archived id, but still lists it", async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: "archived", status: "completed", isArchived: true }),
      ],
    });

    const changes = await listAppointmentChanges(db, ["archived", "deleted"], NOW);

    assert.deepEqual(changes, {
      ids: ["archived", "deleted"],
      schedule: [],
      needsBilling: [],
      needsCompletion: [],
    });
  });

  it("reads a long id list in batches", async () => {
    const seeded = Array.from(
      { length: 600 },
      (_, index) => `appt-${String(index).padStart(4, "0")}`,
    );
    const { db } = createFakeSupabase({
      appointments: seeded.map((id) => appointment({ id, status: "completed" })),
    });

    const changes = await listAppointmentChanges(db, seeded, NOW);

    assert.equal(changes.schedule.length, seeded.length);
    assert.equal(changes.needsBilling.length, seeded.length);
  });

  it("throws when a read fails", async () => {
    const { db } = createFakeSupabase({}, undefined, ["appointments"]);

    await assert.rejects(listAppointmentChanges(db, ["any"], NOW));
  });
});
