import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { billingMismatchLiveLabel } from "../../src/lib/pricing/billing-mismatch.ts";
import type { LivePrice, PricedAppointment } from "../../src/lib/pricing/index.ts";

const LIVE_AT_135: LivePrice = {
  source: "job",
  amount_cents: 13500,
  rate_cents: 4500,
  minutes: 180,
  headcount: 1,
};

function billedAt(amountCents: number, live: LivePrice): PricedAppointment {
  return { live, display: { source: "billed", amount_cents: amountCents } };
}

describe("billingMismatchLiveLabel", () => {
  it("reports the live price when it moved away from the Billed amount", () => {
    assert.equal(billingMismatchLiveLabel(billedAt(12000, LIVE_AT_135)), "$135.00");
  });

  it("reports Unpriced when the live price can no longer be worked out", () => {
    assert.equal(
      billingMismatchLiveLabel(billedAt(12000, { source: "unpriced" })),
      "Unpriced",
    );
  });

  it("reports nothing when the live price still equals the Billed amount", () => {
    assert.equal(billingMismatchLiveLabel(billedAt(13500, LIVE_AT_135)), null);
  });

  it("reports nothing for an appointment shown at its live price (draft or unclaimed)", () => {
    assert.equal(
      billingMismatchLiveLabel({ live: LIVE_AT_135, display: LIVE_AT_135 }),
      null,
    );
  });
});
