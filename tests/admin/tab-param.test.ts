import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTabParam, tabSearch } from "../../src/lib/admin/tab-param.ts";

const TABS = ["locations", "pricing", "billing"] as const;

describe("parseTabParam", () => {
  it("falls back to the default when the param is missing", () => {
    assert.equal(parseTabParam(undefined, TABS, "locations"), "locations");
  });

  it("reads a known tab", () => {
    assert.equal(parseTabParam("pricing", TABS, "locations"), "pricing");
  });

  it("falls back to the default for an unknown tab", () => {
    assert.equal(parseTabParam("invoices", TABS, "locations"), "locations");
  });

  it("falls back to the default when the param is repeated", () => {
    assert.equal(
      parseTabParam(["pricing", "billing"], TABS, "locations"),
      "locations",
    );
  });
});

describe("tabSearch", () => {
  it("sets a non-default tab", () => {
    assert.equal(
      tabSearch(new URLSearchParams(), "pricing", "locations"),
      "?tab=pricing",
    );
  });

  it("deletes the tab param when switching to the default tab", () => {
    assert.equal(
      tabSearch(new URLSearchParams("tab=billing"), "locations", "locations"),
      "",
    );
  });

  it("keeps every other param", () => {
    assert.equal(
      tabSearch(
        new URLSearchParams("from=list&tab=billing&q=lee"),
        "pricing",
        "locations",
      ),
      "?from=list&tab=pricing&q=lee",
    );
    assert.equal(
      tabSearch(new URLSearchParams("tab=billing&q=lee"), "locations", "locations"),
      "?q=lee",
    );
  });

  it("leaves the caller's params untouched", () => {
    const current = new URLSearchParams("tab=billing");

    tabSearch(current, "pricing", "locations");

    assert.equal(current.toString(), "tab=billing");
  });
});
