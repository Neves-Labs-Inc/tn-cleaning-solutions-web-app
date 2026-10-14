import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTimeSheetsHref } from "../../src/components/admin/time-sheets/time-sheets-href.ts";

describe("buildTimeSheetsHref", () => {
  it("includes q when set", () => {
    assert.equal(
      buildTimeSheetsHref({ q: "ana" }),
      "/solutions/time-tracking?q=ana",
    );
  });

  it("omits q when blank or whitespace", () => {
    assert.equal(buildTimeSheetsHref({ q: "" }), "/solutions/time-tracking");
    assert.equal(buildTimeSheetsHref({ q: "   " }), "/solutions/time-tracking");
  });

  it("trims q", () => {
    assert.equal(
      buildTimeSheetsHref({ q: "  ana " }),
      "/solutions/time-tracking?q=ana",
    );
  });

  it("combines q with cleaner, from and to", () => {
    const href = buildTimeSheetsHref({
      cleaner: "c1",
      from: "2026-10-05",
      to: "2026-10-11",
      q: "bárbara",
    });
    const url = new URL(href, "http://x");

    assert.equal(url.pathname, "/solutions/time-tracking");
    assert.equal(url.searchParams.get("cleaner"), "c1");
    assert.equal(url.searchParams.get("from"), "2026-10-05");
    assert.equal(url.searchParams.get("to"), "2026-10-11");
    assert.equal(url.searchParams.get("q"), "bárbara");
  });

  it("gives the bare path with no parts", () => {
    assert.equal(buildTimeSheetsHref({}), "/solutions/time-tracking");
  });
});
