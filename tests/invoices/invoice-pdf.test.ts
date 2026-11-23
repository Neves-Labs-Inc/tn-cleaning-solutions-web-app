import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildInvoicePdfModel,
  getInvoicePdfFilename,
  hasInvoicePdf,
} from "../../src/lib/invoices/invoice-pdf-model.ts";
import { renderInvoicePdf } from "../../src/lib/invoices/invoice-pdf.ts";
import type { InvoiceDetail } from "../../src/lib/invoices/queries.ts";

type Line = InvoiceDetail["lines"][number];
type Invoice = InvoiceDetail["invoice"];

const BUSINESS_DATE = "2026-11-23";
const INTERNAL_NOTE = "Gate code 4471, client is slow to pay";

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: "inv-1",
    client_id: "client-1",
    status: "issued",
    issued_date: "2026-11-01",
    due_date: "2026-11-15",
    notes: "Thank you, e-Transfer is welcome.",
    created_at: "2026-10-30T12:00:00Z",
    updated_at: "2026-10-30T12:00:00Z",
    is_archived: false,
    invoice_number: "INV-042-SMI2026",
    is_automatic: false,
    paid_date: null,
    payment_method: null,
    payment_reference: null,
    total_cents: 0,
    effective_status: "issued",
    activity_date: "2026-11-01",
    is_mark_paid: false,
    internal_note: INTERNAL_NOTE,
    client: { id: "client-1", name: "Smith residence", phone: "555-0100", email: "smith@example.test" },
    ...overrides,
  };
}

function line(day: string, overrides: Partial<Line> = {}): Line {
  return {
    visit: {
      id: `visit-${day}`,
      status: "completed",
      scheduled_date: day,
      scheduled_start_time: "09:00",
      scheduled_end_time: "11:00",
      job_name: "Standard clean",
      location_label: "14 Maple Ave",
      price_override_cents: null,
      live: { source: "calculated", amount_cents: 14000, rate_cents: 4500, minutes: 120, headcount: 1 },
    },
    billed_amount_cents: 14000,
    billed_rate_cents: 4500,
    billed_minutes: 120,
    cancelled_at: null,
    is_released: false,
    state: "ok",
    amount_cents: 14000,
    ...overrides,
  } as Line;
}

const CANCELLED = line("2026-10-20", { cancelled_at: "2026-10-18T00:00:00Z", state: "cancelled", amount_cents: 0 });
const UPCOMING = line("2026-11-30", {
  state: "upcoming",
  visit: { ...line("2026-11-30").visit, status: "scheduled" },
});
const SHORT_LINES = [line("2026-10-27"), CANCELLED, line("2026-10-06"), UPCOMING];

function detail(status: Invoice["status"], overrides: Partial<Invoice> = {}, lines = SHORT_LINES): InvoiceDetail {
  const isDraft = status === "draft";
  return {
    invoice: invoice({
      status,
      invoice_number: isDraft ? null : "INV-042-SMI2026",
      issued_date: isDraft ? null : "2026-11-01",
      ...overrides,
    }),
    lines,
    total_cents: lines.reduce((sum, item) => sum + item.amount_cents, 0),
    has_unpriced: false,
  };
}

const PAID = { paid_date: "2026-11-09", payment_method: "e-Transfer", payment_reference: "REF-SECRET" };

describe("buildInvoicePdfModel", () => {
  it("shows Draft and Not issued on a draft", () => {
    const model = buildInvoicePdfModel(detail("draft"), BUSINESS_DATE);
    assert.equal(model.invoiceNumber, "Draft");
    assert.equal(model.issuedDate, "Not issued");
    assert.equal(model.watermark, "DRAFT");
  });

  it("shows the number, issued date and due date on an issued invoice", () => {
    const model = buildInvoicePdfModel(detail("issued"), BUSINESS_DATE);
    assert.equal(model.invoiceNumber, "INV-042-SMI2026");
    assert.equal(model.issuedDate, "Nov 1, 2026");
    assert.equal(model.dueDate, "Nov 15, 2026");
    assert.equal(model.watermark, null);
  });

  it("leaves the Due row out when no due date is set", () => {
    const model = buildInvoicePdfModel(detail("issued", { due_date: null }), BUSINESS_DATE);
    assert.equal(model.dueDate, null);
  });

  it("names the client only, with no contact details", () => {
    const model = buildInvoicePdfModel(detail("issued"), BUSINESS_DATE);
    const text = JSON.stringify(model);
    assert.equal(model.clientName, "Smith residence");
    assert.ok(!text.includes("555-0100") && !text.includes("smith@example.test"));
  });

  it("never carries the Internal note", () => {
    const text = JSON.stringify(buildInvoicePdfModel(detail("issued"), BUSINESS_DATE));
    assert.ok(!text.includes(INTERNAL_NOTE));
  });

  it("carries the client-facing Notes, or null when blank", () => {
    assert.equal(
      buildInvoicePdfModel(detail("issued"), BUSINESS_DATE).notes,
      "Thank you, e-Transfer is welcome.",
    );
    assert.equal(buildInvoicePdfModel(detail("issued", { notes: "  \n " }), BUSINESS_DATE).notes, null);
  });

  it("lists lines by date with job name, pill and amount", () => {
    const { lines, total } = buildInvoicePdfModel(detail("issued"), BUSINESS_DATE);
    assert.deepEqual(
      lines.map((item) => [item.date, item.description, item.status, item.amount, item.isStruck]),
      [
        ["Oct 6, 2026", "Standard clean", null, "$140.00", false],
        ["Oct 20, 2026", "Standard clean", "Cancelled", "$0.00", true],
        ["Oct 27, 2026", "Standard clean", null, "$140.00", false],
        ["Nov 30, 2026", "Standard clean", "Upcoming", "$140.00", false],
      ],
    );
    assert.equal(total, "$420.00");
  });

  it("prices an issued line at its Billed amount, not the Live price", () => {
    const billed = line("2026-10-06", { billed_amount_cents: 9000, amount_cents: 9000 });
    const { lines, total } = buildInvoicePdfModel(detail("issued", {}, [billed]), BUSINESS_DATE);
    assert.equal(lines[0].amount, "$90.00");
    assert.equal(total, "$90.00");
  });

  it("shows an Unpriced draft line as $0.00 with the Unpriced pill, counted as $0", () => {
    const unpriced = line("2026-10-13", {
      state: "unpriced",
      amount_cents: 0,
      billed_amount_cents: null,
      visit: { ...line("2026-10-13").visit, live: { source: "unpriced" } },
    });
    const model = buildInvoicePdfModel(detail("draft", {}, [line("2026-10-06"), unpriced]), BUSINESS_DATE);
    assert.deepEqual(
      model.lines.map((item) => [item.status, item.amount]),
      [[null, "$140.00"], ["Unpriced", "$0.00"]],
    );
    assert.equal(model.total, "$140.00");
  });

  it("stamps a paid invoice with the paid date and method, never the reference", () => {
    const model = buildInvoicePdfModel(detail("paid", PAID), BUSINESS_DATE);
    assert.deepEqual(model.paid, { date: "Nov 9, 2026", method: "e-Transfer" });
    assert.ok(!JSON.stringify(model).includes("REF-SECRET"));
  });

  it("has no stamp unless paid, and watermarks a void invoice", () => {
    assert.equal(buildInvoicePdfModel(detail("issued"), BUSINESS_DATE).paid, null);
    const voided = buildInvoicePdfModel(detail("void"), BUSINESS_DATE);
    assert.equal(voided.paid, null);
    assert.equal(voided.watermark, "VOID");
  });
});

describe("getInvoicePdfFilename", () => {
  it("is the Invoice number", () => {
    assert.equal(getInvoicePdfFilename(detail("issued"), BUSINESS_DATE), "INV-042-SMI2026.pdf");
  });

  it("is Draft, the client name and the Business date for a draft", () => {
    assert.equal(
      getInvoicePdfFilename(detail("draft", { client: { id: "c", name: "Margaret Okafor", phone: null, email: null } }), BUSINESS_DATE),
      "Draft-Margaret-Okafor-2026-11-23.pdf",
    );
  });

  it("makes an awkward client name safe for a file name", () => {
    const name = '  Zoë "O\'Neil" / Sons: #1?..\\ ';
    const filename = getInvoicePdfFilename(
      detail("draft", { client: { id: "c", name, phone: null, email: null } }),
      BUSINESS_DATE,
    );
    assert.equal(filename, "Draft-Zoe-O-Neil-Sons-1-2026-11-23.pdf");
  });

  it("falls back when nothing safe is left of the name", () => {
    const filename = getInvoicePdfFilename(
      detail("draft", { client: { id: "c", name: "田中", phone: null, email: null } }),
      BUSINESS_DATE,
    );
    assert.equal(filename, "Draft-client-2026-11-23.pdf");
  });
});

describe("hasInvoicePdf", () => {
  it("is false only for a paid invoice carrying the Mark paid marker", () => {
    const cases: [Invoice["status"], boolean, boolean][] = [
      ["paid", true, false],
      ["paid", false, true],
      ["issued", true, true],
      ["draft", false, true],
      ["void", true, true],
      ["void", false, true],
    ];
    for (const [status, isMarkPaid, expected] of cases) {
      assert.equal(hasInvoicePdf({ status, is_mark_paid: isMarkPaid }), expected, `${status} ${isMarkPaid}`);
    }
  });
});

function assertPdf(buffer: Buffer): void {
  assert.ok(buffer.length > 500);
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
}

function countPages(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
}

describe("renderInvoicePdf", () => {
  const cases: [string, InvoiceDetail][] = [
    ["draft", detail("draft")],
    ["issued", detail("issued")],
    ["paid", detail("paid", PAID)],
    ["void", detail("void")],
  ];

  for (const [name, source] of cases) {
    it(`renders a valid PDF for a ${name} invoice`, async () => {
      assertPdf(await renderInvoicePdf(buildInvoicePdfModel(source, BUSINESS_DATE)));
    });
  }

  it("renders an invoice with no lines and no Notes", async () => {
    const empty = detail("issued", { notes: null, due_date: null }, []);
    assertPdf(await renderInvoicePdf(buildInvoicePdfModel(empty, BUSINESS_DATE)));
  });

  it("runs a 45-line invoice over several pages", async () => {
    const lines = Array.from({ length: 45 }, (_, index) =>
      line(`2026-09-${String((index % 28) + 1).padStart(2, "0")}`),
    );
    const single = await renderInvoicePdf(buildInvoicePdfModel(detail("paid", PAID), BUSINESS_DATE));
    const long = await renderInvoicePdf(buildInvoicePdfModel(detail("paid", PAID, lines), BUSINESS_DATE));
    assertPdf(long);
    assert.equal(countPages(single), 1);
    assert.ok(countPages(long) >= 2);
  });
});
