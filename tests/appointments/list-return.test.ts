import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { browserListStorage, listReturnHref, rememberListHref } from "../../src/lib/appointments/list-return.ts";

const BARE = "/solutions/appointments";
const MONTH = "/solutions/appointments?layout=month&month=3&year=2027&clientId=abc";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const throwingStorage: Pick<Storage, "getItem" | "setItem"> = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("list return href", () => {
  it("returns the remembered list URL", () => {
    const storage = memoryStorage();
    rememberListHref(storage, MONTH);
    assert.equal(listReturnHref(storage), MONTH);
  });

  it("returns the bare list when nothing is saved", () => {
    assert.equal(listReturnHref(memoryStorage()), BARE);
  });

  it("returns the bare list when storage is missing", () => {
    assert.equal(listReturnHref(null), BARE);
  });

  it("reads and writes silently when storage throws", () => {
    assert.doesNotThrow(() => rememberListHref(throwingStorage, MONTH));
    assert.equal(listReturnHref(throwingStorage), BARE);
  });

  it("keeps a remembered bare list", () => {
    const storage = memoryStorage();
    rememberListHref(storage, MONTH);
    rememberListHref(storage, BARE);
    assert.equal(listReturnHref(storage), BARE);
  });

  it("reads blocked browser storage as nothing saved", () => {
    const blocked = {
      get sessionStorage(): Storage {
        throw new Error("SecurityError");
      },
    };
    Object.defineProperty(globalThis, "window", { value: blocked, configurable: true });
    try {
      assert.equal(browserListStorage(), null);
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  for (const stored of [
    "/solutions/clients?x=1",
    "https://evil.example/solutions/appointments",
    "//evil.example",
    "/solutions/appointments/new",
    "/solutions/appointments/123?view=paid",
    "/solutions/appointmentsX",
  ]) {
    it(`rejects a foreign or nested href: ${stored}`, () => {
      const storage = memoryStorage();
      rememberListHref(storage, stored);
      assert.equal(listReturnHref(storage), BARE);
    });
  }
});
