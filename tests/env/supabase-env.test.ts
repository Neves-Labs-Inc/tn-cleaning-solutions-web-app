import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, describe, it } from "node:test";

import { getSupabasePublicEnv } from "../../src/lib/env.ts";

// `server-only` throws unless resolved under the react-server condition, which Next applies on the
// server. Resolve it the same way here so the real secret accessor can be loaded.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier !== "server-only") return nextResolve(specifier, context);
    return nextResolve(specifier, { ...context, conditions: [...context.conditions, "react-server"] });
  },
});

const { getSupabaseSecretKey } = await import("../../src/lib/env.server.ts");

const URL_VAR = "NEXT_PUBLIC_SUPABASE_URL";
const PUBLISHABLE_VAR = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const SECRET_VAR = "SUPABASE_SECRET_KEY";
const MANAGED_VARS = [URL_VAR, PUBLISHABLE_VAR, SECRET_VAR];

const URL_VALUE = "https://example-ref.supabase.co";
const PUBLISHABLE_VALUE = "sb_publishable_test-value-123";
const SECRET_VALUE = "sb_secret_test-value-456";

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(MANAGED_VARS.map((name) => [name, process.env[name]]));
  process.env[URL_VAR] = URL_VALUE;
  process.env[PUBLISHABLE_VAR] = PUBLISHABLE_VALUE;
  process.env[SECRET_VAR] = SECRET_VALUE;
});

afterEach(() => {
  for (const name of MANAGED_VARS) {
    if (savedEnv[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = savedEnv[name];
    }
  }
});

function assertThrowsNaming(read: () => unknown, name: string) {
  const leakedValues = [URL_VALUE, PUBLISHABLE_VALUE, SECRET_VALUE];
  assert.throws(read, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, new RegExp(`\\b${name}\\b`));
    for (const value of leakedValues) {
      assert.ok(!error.message.includes(value), `message leaked a value: ${error.message}`);
    }
    return true;
  });
}

describe("getSupabasePublicEnv", () => {
  it("returns the url and publishable key when both are set", () => {
    assert.deepEqual(getSupabasePublicEnv(), {
      url: URL_VALUE,
      publishableKey: PUBLISHABLE_VALUE,
    });
  });

  it("throws naming NEXT_PUBLIC_SUPABASE_URL when it is missing", () => {
    delete process.env[URL_VAR];
    assertThrowsNaming(getSupabasePublicEnv, URL_VAR);
  });

  it("throws naming NEXT_PUBLIC_SUPABASE_URL when it is empty", () => {
    process.env[URL_VAR] = "";
    assertThrowsNaming(getSupabasePublicEnv, URL_VAR);
  });

  it("throws naming NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY when it is missing", () => {
    delete process.env[PUBLISHABLE_VAR];
    assertThrowsNaming(getSupabasePublicEnv, PUBLISHABLE_VAR);
  });

  it("throws naming NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY when it is empty", () => {
    process.env[PUBLISHABLE_VAR] = "";
    assertThrowsNaming(getSupabasePublicEnv, PUBLISHABLE_VAR);
  });
});

describe("getSupabaseSecretKey", () => {
  it("returns the secret key when it is set", () => {
    assert.equal(getSupabaseSecretKey(), SECRET_VALUE);
  });

  it("throws naming SUPABASE_SECRET_KEY when it is missing", () => {
    delete process.env[SECRET_VAR];
    assertThrowsNaming(getSupabaseSecretKey, SECRET_VAR);
  });

  it("throws naming SUPABASE_SECRET_KEY when it is empty", () => {
    process.env[SECRET_VAR] = "";
    assertThrowsNaming(getSupabaseSecretKey, SECRET_VAR);
  });
});
