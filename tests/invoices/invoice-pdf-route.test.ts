import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contentDisposition,
  createInvoicePdfResponse,
  type InvoicePdfRequest,
} from "../../src/lib/invoices/invoice-pdf-response.ts";
import type { InvoiceDetail } from "../../src/lib/invoices/queries.ts";

type Invoice = InvoiceDetail["invoice"];

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";
const BUSINESS_DATE = "2026-11-23";

function detail(overrides: Partial<Invoice> = {}): InvoiceDetail {
  return {
    invoice: {
      id: INVOICE_ID,
      client_id: CLIENT_ID,
      status: "issued",
      issued_date: "2026-11-01",
      due_date: "2026-11-15",
      notes: null,
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
      internal_note: null,
      client: { id: CLIENT_ID, name: "Margaret Okafor", phone: null, email: null },
      ...overrides,
    },
    lines: [],
    total_cents: 0,
    has_unpriced: false,
  } as InvoiceDetail;
}

function request(overrides: Partial<InvoicePdfRequest> = {}): InvoicePdfRequest {
  return {
    role: "admin",
    clientId: CLIENT_ID,
    invoiceId: INVOICE_ID,
    businessDate: BUSINESS_DATE,
    loadDetail: async () => detail(),
    ...overrides,
  };
}

describe("createInvoicePdfResponse", () => {
  it("serves an admin the PDF named after the invoice number", async () => {
    const response = await createInvoicePdfResponse(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/pdf");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("Content-Disposition") ?? "", /^attachment; filename="INV-042-SMI2026\.pdf"/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  });

  it("names a draft after the client and the Business date", async () => {
    const response = await createInvoicePdfResponse(
      request({ loadDetail: async () => detail({ status: "draft", invoice_number: null, is_archived: true }) }),
    );
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("Content-Disposition") ?? "",
      /filename="Draft-Margaret-Okafor-2026-11-23\.pdf"/,
    );
  });

  it("serves void invoices", async () => {
    const response = await createInvoicePdfResponse(
      request({ loadDetail: async () => detail({ status: "void" }) }),
    );
    assert.equal(response.status, 200);
  });

  for (const role of ["employee", undefined]) {
    it(`404s for role ${String(role)} without loading the invoice`, async () => {
      let hasLoaded = false;
      const response = await createInvoicePdfResponse(
        request({
          role,
          loadDetail: async () => {
            hasLoaded = true;
            return detail();
          },
        }),
      );
      assert.equal(response.status, 404);
      assert.equal(hasLoaded, false);
    });
  }

  it("404s when the invoice belongs to another client", async () => {
    const response = await createInvoicePdfResponse(request({ clientId: OTHER_CLIENT_ID }));
    assert.equal(response.status, 404);
  });

  it("404s for an unknown invoice", async () => {
    const response = await createInvoicePdfResponse(request({ loadDetail: async () => null }));
    assert.equal(response.status, 404);
  });

  it("404s for ids that are not UUIDs without loading", async () => {
    let hasLoaded = false;
    const loadDetail = async () => {
      hasLoaded = true;
      return detail();
    };
    const badInvoice = await createInvoicePdfResponse(request({ invoiceId: "nope", loadDetail }));
    const badClient = await createInvoicePdfResponse(request({ clientId: "nope", loadDetail }));
    assert.equal(badInvoice.status, 404);
    assert.equal(badClient.status, 404);
    assert.equal(hasLoaded, false);
  });

  it("404s for a Mark paid invoice while it stays paid", async () => {
    const response = await createInvoicePdfResponse(
      request({ loadDetail: async () => detail({ status: "paid", is_mark_paid: true }) }),
    );
    assert.equal(response.status, 404);
  });

  it("serves a paid invoice that was not Mark paid", async () => {
    const response = await createInvoicePdfResponse(
      request({
        loadDetail: async () =>
          detail({ status: "paid", paid_date: "2026-11-09", payment_method: "Cash" }),
      }),
    );
    assert.equal(response.status, 200);
  });
});

describe("contentDisposition", () => {
  it("quotes the name and adds the encoded form", () => {
    assert.equal(
      contentDisposition("INV-042.pdf"),
      `attachment; filename="INV-042.pdf"; filename*=UTF-8''INV-042.pdf`,
    );
  });

  it("cannot be broken out of by quotes, slashes or line breaks", () => {
    const header = contentDisposition('a"b\r\nX: y/../é.pdf');
    assert.doesNotMatch(header, /[\r\n]/);
    assert.match(header, /^attachment; filename="a_b__X: y_\.\.__\.pdf"; /);
    assert.match(header, /filename\*=UTF-8''a%22b%0D%0AX%3A%20y%2F\.\.%2F%C3%A9\.pdf$/);
  });
});
