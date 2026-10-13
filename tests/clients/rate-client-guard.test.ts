import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ARCHIVED_CLIENT_ERROR } from "../../src/lib/clients/archived-client.ts";
import { getRateEditRefusal } from "../../src/lib/clients/rate-client-guard.ts";
import { createFakeSupabase } from "../invoices/fake-supabase.ts";

function seed() {
  return createFakeSupabase({
    clients: [
      { id: "active", is_archived: false },
      { id: "archived", is_archived: true },
    ],
    client_job_pricing: [
      { id: "rate-active", client_id: "active" },
      { id: "rate-archived", client_id: "archived" },
    ],
  });
}

describe("getRateEditRefusal", () => {
  it("allows a new rate for an active client", async () => {
    const { db } = seed();

    assert.equal(await getRateEditRefusal(db, { clientId: "active" }), null);
  });

  it("refuses a new rate for an archived client", async () => {
    const { db } = seed();

    assert.equal(
      await getRateEditRefusal(db, { clientId: "archived" }),
      ARCHIVED_CLIENT_ERROR,
    );
  });

  it("allows changing a rate whose client is active", async () => {
    const { db } = seed();

    assert.equal(
      await getRateEditRefusal(db, { pricingId: "rate-active" }),
      null,
    );
  });

  it("refuses changing a rate whose client is archived", async () => {
    const { db } = seed();

    assert.equal(
      await getRateEditRefusal(db, { pricingId: "rate-archived" }),
      ARCHIVED_CLIENT_ERROR,
    );
  });

  it("reports a missing rate as not found", async () => {
    const { db } = seed();

    assert.equal(
      await getRateEditRefusal(db, { pricingId: "nope" }),
      "Pricing rule not found.",
    );
  });

  it("refuses when the rate lookup fails", async () => {
    const { db } = createFakeSupabase({}, undefined, ["client_job_pricing"]);

    await assert.rejects(
      getRateEditRefusal(db, { pricingId: "rate-active" }),
      /Couldn't read rate rate-active: connection reset/,
    );
  });
});
