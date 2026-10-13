import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTabParam } from "../../src/lib/admin/tab-param.ts";
import { CLIENT_TABS } from "../../src/lib/clients/client-page.ts";

describe("client page tabs", () => {
  it("falls back to Locations for an unknown tab", () => {
    assert.equal(parseTabParam("invoices", CLIENT_TABS, "locations"), "locations");
  });

  it("reads the Billing tab", () => {
    assert.equal(parseTabParam("billing", CLIENT_TABS, "locations"), "billing");
  });
});
