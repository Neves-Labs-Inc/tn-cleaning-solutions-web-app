import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  paymentStateOf,
  type PaymentClaim,
} from "../../src/lib/invoices/payment-state.ts";

const COMPLETED_AT = "2026-10-07T18:00:00Z";

function claim(status: PaymentClaim["status"]): PaymentClaim {
  return { id: "inv-1", number: status === "draft" ? null : "INV-042-SMI2026", status };
}

describe("paymentStateOf", () => {
  it("is paid when the Live claim is on a paid invoice", () => {
    const state = paymentStateOf({
      status: "completed",
      completed_at: COMPLETED_AT,
      claim: claim("paid"),
    });
    assert.equal(state, "paid");
  });

  it("is paid for a prepaid appointment that isn't completed yet", () => {
    const state = paymentStateOf({
      status: "scheduled",
      completed_at: null,
      claim: claim("paid"),
    });
    assert.equal(state, "paid");
  });

  it("is billed when the Live claim is on a draft", () => {
    const state = paymentStateOf({
      status: "completed",
      completed_at: COMPLETED_AT,
      claim: claim("draft"),
    });
    assert.equal(state, "billed");
  });

  it("is billed for an Upcoming line on an issued invoice", () => {
    const state = paymentStateOf({
      status: "scheduled",
      completed_at: null,
      claim: claim("issued"),
    });
    assert.equal(state, "billed");
  });

  it("is unbilled when completed after launch with no Live claim", () => {
    const state = paymentStateOf({
      status: "completed",
      completed_at: COMPLETED_AT,
      claim: null,
    });
    assert.equal(state, "unbilled");
  });

  it("has no state when completed before launch with no Live claim", () => {
    const state = paymentStateOf({
      status: "completed",
      completed_at: null,
      claim: null,
    });
    assert.equal(state, null);
  });

  it("has no state when not completed and not claimed", () => {
    for (const status of ["scheduled", "in_progress", "cancelled"] as const) {
      const state = paymentStateOf({
        status,
        completed_at: COMPLETED_AT,
        claim: null,
      });
      assert.equal(state, null, status);
    }
  });
});
