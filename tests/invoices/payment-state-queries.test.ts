import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAppointmentClaim,
  listNeedsBilling,
  loadClaims,
} from "../../src/lib/invoices/payment-state-queries.ts";
import { createFakeSupabase } from "./fake-supabase.ts";

type InvoiceSeed = {
  id: string;
  status: "draft" | "issued" | "paid" | "void";
  invoice_number: string | null;
};

const DRAFT: InvoiceSeed = { id: "inv-draft", status: "draft", invoice_number: null };
const ISSUED: InvoiceSeed = { id: "inv-issued", status: "issued", invoice_number: "INV-001-SMI2026" };
const PAID: InvoiceSeed = { id: "inv-paid", status: "paid", invoice_number: "INV-002-SMI2026" };
const VOID: InvoiceSeed = { id: "inv-void", status: "void", invoice_number: "INV-003-SMI2026" };

function line(
  appointmentId: string,
  invoice: InvoiceSeed,
  overrides: { is_archived?: boolean; cancelled_at?: string | null } = {},
) {
  return {
    appointment_id: appointmentId,
    invoice_id: invoice.id,
    billed_amount_cents: invoice.status === "draft" ? null : 12000,
    is_archived: false,
    cancelled_at: null,
    ...overrides,
    invoice,
  };
}

describe("loadClaims", () => {
  it("returns each appointment's Live claim invoice", async () => {
    const { db } = createFakeSupabase({
      invoice_appointments: [
        line("on-draft", DRAFT),
        line("on-issued", ISSUED),
        line("on-paid", PAID),
      ],
    });

    const claims = await loadClaims(db, ["on-draft", "on-issued", "on-paid", "unclaimed"]);

    assert.deepEqual(Object.fromEntries(claims), {
      "on-draft": { id: "inv-draft", number: null, status: "draft" },
      "on-issued": { id: "inv-issued", number: "INV-001-SMI2026", status: "issued" },
      "on-paid": { id: "inv-paid", number: "INV-002-SMI2026", status: "paid" },
    });
  });

  it("ignores lines on void invoices, archived lines and cancelled lines", async () => {
    const { db } = createFakeSupabase({
      invoice_appointments: [
        line("voided", VOID, { is_archived: true }),
        line("voided-unarchived", VOID),
        line("released", DRAFT, { is_archived: true }),
        line("cancelled", ISSUED, { cancelled_at: "2026-10-08T12:00:00Z" }),
      ],
    });

    const claims = await loadClaims(db, ["voided", "voided-unarchived", "released", "cancelled"]);

    assert.equal(claims.size, 0);
  });

  it("reads a long id list without overflowing the request URL", async () => {
    const ids = Array.from({ length: 600 }, (_, index) => `appt-${String(index).padStart(4, "0")}`);
    const { db } = createFakeSupabase({
      invoice_appointments: ids.map((id) => line(id, PAID)),
    });

    const claims = await loadClaims(db, ids);

    assert.equal(claims.size, ids.length);
  });

  it("reads nothing for no ids", async () => {
    const { db } = createFakeSupabase({}, undefined, ["invoice_appointments"]);

    const claims = await loadClaims(db, []);

    assert.equal(claims.size, 0);
  });
});

type AppointmentSeed = {
  id: string;
  date?: string;
  start?: string;
  end?: string;
  status?: string;
  completedAt?: string | null;
  isArchived?: boolean;
  live?: Array<{ is_archived: boolean; cancelled_at: string | null }>;
  hourlyRateCents?: number | null;
  clientId?: string;
  clientName?: string;
};

const JOB_RATE_CENTS = 4000;

function appointment(seed: AppointmentSeed) {
  const rate = seed.hourlyRateCents === undefined ? JOB_RATE_CENTS : seed.hourlyRateCents;
  return {
    id: seed.id,
    client_id: seed.clientId ?? "smith",
    job_id: "standard",
    scheduled_date: seed.date ?? "2026-10-07",
    scheduled_start_time: seed.start ?? "09:00:00",
    scheduled_end_time: seed.end ?? "12:00:00",
    price_override_cents: null,
    pricing_job: rate === null ? null : { hourly_rate_cents: rate },
    status: seed.status ?? "completed",
    completed_at: seed.completedAt === undefined ? "2026-10-07T16:00:00Z" : seed.completedAt,
    is_archived: seed.isArchived ?? false,
    jobs: { name: "Standard clean" },
    clients: { name: seed.clientName ?? "Maria Silva" },
    live: seed.live ?? [],
  };
}

describe("listNeedsBilling", () => {
  it("lists Unbilled appointments oldest first with client, Job, times and Live price", async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: "oct-2", date: "2026-10-02" }),
        appointment({ id: "sep-15-afternoon", date: "2025-09-15", start: "13:00:00", end: "15:30:00" }),
        appointment({ id: "sep-15-b", date: "2025-09-15", clientId: "jones", clientName: "Ana Jones" }),
        appointment({ id: "sep-15-a", date: "2025-09-15", hourlyRateCents: null }),
      ],
    });

    const rows = await listNeedsBilling(db);

    assert.deepEqual(rows, [
      {
        id: "sep-15-a",
        clientId: "smith",
        clientName: "Maria Silva",
        scheduledDate: "2025-09-15",
        startTime: "09:00:00",
        endTime: "12:00:00",
        jobId: "standard",
        jobName: "Standard clean",
        livePriceCents: null,
      },
      {
        id: "sep-15-b",
        clientId: "jones",
        clientName: "Ana Jones",
        scheduledDate: "2025-09-15",
        startTime: "09:00:00",
        endTime: "12:00:00",
        jobId: "standard",
        jobName: "Standard clean",
        livePriceCents: 12000,
      },
      {
        id: "sep-15-afternoon",
        clientId: "smith",
        clientName: "Maria Silva",
        scheduledDate: "2025-09-15",
        startTime: "13:00:00",
        endTime: "15:30:00",
        jobId: "standard",
        jobName: "Standard clean",
        livePriceCents: 10000,
      },
      {
        id: "oct-2",
        clientId: "smith",
        clientName: "Maria Silva",
        scheduledDate: "2026-10-02",
        startTime: "09:00:00",
        endTime: "12:00:00",
        jobId: "standard",
        jobName: "Standard clean",
        livePriceCents: 12000,
      },
    ]);
  });

  it("leaves out claimed, unfinished, and archived appointments", async () => {
    const { db } = createFakeSupabase({
      appointments: [
        appointment({ id: "claimed", live: [{ is_archived: false, cancelled_at: null }] }),
        appointment({ id: "scheduled", status: "scheduled", completedAt: null }),
        appointment({ id: "cancelled", status: "cancelled" }),
        appointment({ id: "archived", isArchived: true }),
        appointment({ id: "released", live: [{ is_archived: true, cancelled_at: null }] }),
        appointment({ id: "cancelled-line", live: [{ is_archived: false, cancelled_at: "2026-10-08T12:00:00Z" }] }),
      ],
    });

    const rows = await listNeedsBilling(db);

    assert.deepEqual(
      rows.map((row) => row.id),
      ["cancelled-line", "released"],
    );
  });

  it("includes a completed appointment whose completed_at is null", async () => {
    const { db } = createFakeSupabase({
      appointments: [appointment({ id: "pre-launch", completedAt: null })],
    });

    const rows = await listNeedsBilling(db);

    assert.deepEqual(
      rows.map((row) => row.id),
      ["pre-launch"],
    );
  });

  it("reads past the row cap", async () => {
    const count = 1500;
    const { db } = createFakeSupabase({
      appointments: Array.from({ length: count }, (_, index) =>
        appointment({ id: `appt-${String(index).padStart(4, "0")}` }),
      ),
    });

    const rows = await listNeedsBilling(db);

    assert.equal(rows.length, count);
  });
});

describe("getAppointmentClaim", () => {
  it("returns the Live claim with its invoice's total", async () => {
    const { db } = createFakeSupabase({
      invoice_appointments: [line("on-issued", ISSUED), line("other", ISSUED)],
      invoices_with_status: [{ id: "inv-issued", total_cents: 24000 }],
    });

    const result = await getAppointmentClaim(db, "on-issued");

    assert.deepEqual(result, {
      claim: { id: "inv-issued", number: "INV-001-SMI2026", status: "issued" },
      totalCents: 24000,
    });
  });

  it("returns no claim and no total for an unclaimed appointment", async () => {
    const { db } = createFakeSupabase({
      invoice_appointments: [line("voided", VOID, { is_archived: true })],
    }, undefined, ["invoices_with_status"]);

    const result = await getAppointmentClaim(db, "voided");

    assert.deepEqual(result, { claim: null, totalCents: null });
  });
});
