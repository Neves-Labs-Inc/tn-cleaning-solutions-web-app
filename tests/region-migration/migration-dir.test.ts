import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSafeMigrationDir,
  type MigrationDirFs,
} from "../../src/lib/region-migration/migration-dir.ts";

const REPO_ROOT = "/Users/franklin/code/web-app";

// An in-memory filesystem: `links` maps a symlink to its target, `dirs` lists real directories.
function fakeFs(
  dirs: string[],
  links: Record<string, string> = {},
): MigrationDirFs {
  const linkEntries = Object.entries(links);
  return {
    exists: (path) =>
      dirs.includes(path) || resolveLinks(path, linkEntries) !== path,
    realpath: (path) => resolveLinks(path, linkEntries),
  };
}

function resolveLinks(path: string, links: [string, string][]): string {
  const link = links.find(
    ([from]) => path === from || path.startsWith(`${from}/`),
  );
  return link === undefined ? path : `${link[1]}${path.slice(link[0].length)}`;
}

const FS = fakeFs(["/", "/Users", "/Users/franklin", REPO_ROOT, "/tmp"]);

test("accepts an absolute path outside the repo", () => {
  assert.doesNotThrow(() =>
    assertSafeMigrationDir("/Users/franklin/migration-dump", REPO_ROOT, FS),
  );
});

test("accepts a sibling directory whose name starts with the repo's", () => {
  assert.doesNotThrow(() =>
    assertSafeMigrationDir(`${REPO_ROOT}-dump`, REPO_ROOT, FS),
  );
});

test("rejects the repo root", () => {
  assert.throws(
    () => assertSafeMigrationDir(REPO_ROOT, REPO_ROOT, FS),
    /inside the repo/,
  );
});

test("rejects the repo root written with a trailing slash", () => {
  assert.throws(
    () => assertSafeMigrationDir(`${REPO_ROOT}/`, REPO_ROOT, FS),
    /inside the repo/,
  );
});

test("rejects a subdirectory of the repo", () => {
  assert.throws(
    () => assertSafeMigrationDir(`${REPO_ROOT}/.scratch/dump`, REPO_ROOT, FS),
    /inside the repo/,
  );
});

test("rejects a path that climbs back into the repo", () => {
  assert.throws(
    () =>
      assertSafeMigrationDir(`/tmp/../${REPO_ROOT}/dump`, REPO_ROOT, FS),
    /inside the repo/,
  );
});

test("rejects a relative path", () => {
  assert.throws(
    () => assertSafeMigrationDir("../migration-dump", REPO_ROOT, FS),
    /absolute/,
  );
});

test("rejects an empty path", () => {
  assert.throws(() => assertSafeMigrationDir("", REPO_ROOT, FS), /absolute/);
});

test("rejects a symlink that resolves into the repo", () => {
  const fs = fakeFs(["/", "/tmp", REPO_ROOT], {
    "/tmp/dump": `${REPO_ROOT}/dump`,
  });

  assert.throws(
    () => assertSafeMigrationDir("/tmp/dump", REPO_ROOT, fs),
    /inside the repo/,
  );
});

test("rejects a new directory under a symlinked parent that points into the repo", () => {
  const fs = fakeFs(["/", "/tmp", REPO_ROOT], { "/tmp/link": REPO_ROOT });

  assert.throws(
    () => assertSafeMigrationDir("/tmp/link/not-yet-created", REPO_ROOT, fs),
    /inside the repo/,
  );
});

test("rejects a path inside the repo when the repo root is itself a symlink", () => {
  const fs = fakeFs(["/", "/real", "/real/web-app"], {
    [REPO_ROOT]: "/real/web-app",
  });

  assert.throws(
    () => assertSafeMigrationDir("/real/web-app/dump", REPO_ROOT, fs),
    /inside the repo/,
  );
});

test("rejects a path into the repo spelled with different letter case", () => {
  const miscased = REPO_ROOT.replace("/code/", "/Code/");

  assert.throws(
    () => assertSafeMigrationDir(`${miscased}/dump`, REPO_ROOT, FS),
    /inside the repo/,
  );
});

test("rejects a dangling symlink instead of skipping past it", () => {
  // lstat-based `exists` sees the link; realpath fails because its target is not there yet.
  const fs: MigrationDirFs = {
    exists: (path) => ["/", "/tmp", "/tmp/dump", REPO_ROOT].includes(path),
    realpath: (path) => {
      if (path === "/tmp/dump") {
        throw new Error(`ENOENT: no such file or directory, realpath '${path}'`);
      }
      return path;
    },
  };

  assert.throws(
    () => assertSafeMigrationDir("/tmp/dump", REPO_ROOT, fs),
    /Cannot resolve "\/tmp\/dump"/,
  );
});

test("accepts a symlink that resolves outside the repo", () => {
  const fs = fakeFs(["/", "/tmp", "/Volumes/secure", REPO_ROOT], {
    "/tmp/dump": "/Volumes/secure/dump",
  });

  assert.doesNotThrow(() =>
    assertSafeMigrationDir("/tmp/dump", REPO_ROOT, fs),
  );
});

test("returns the resolved directory, so callers write where the guard looked", () => {
  // The raw string can differ from where the guard looked (symlinks, ".."), so callers use this.
  const fs = fakeFs(["/", "/tmp", "/Volumes/secure", REPO_ROOT], {
    "/tmp/dump": "/Volumes/secure/dump",
  });

  assert.equal(
    assertSafeMigrationDir("/tmp/dump/", REPO_ROOT, fs),
    "/Volumes/secure/dump",
  );
});
