import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Relative import: the shell scripts run tsx from outside the repo, where the
// @/ alias (resolved from the cwd's tsconfig) is not available.
import {
  assertSafeMigrationDir,
  type MigrationDirFs,
} from "../../src/lib/region-migration/migration-dir.ts";

// Guards MIGRATION_DIR against every checkout of this repo and prints the
// resolved directory on stdout. Callers write only to that printed path.
// Usage: tsx migration-dir.ts [--create]

const PRIVATE_DIR_MODE = 0o700;
const GROUP_OTHER_BITS = 0o077;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const NODE_FS: MigrationDirFs = {
  exists: (target) =>
    fs.lstatSync(target, { throwIfNoEntry: false }) !== undefined,
  realpath: (target) => fs.realpathSync.native(target),
};

// The worktree root, plus the main checkout when run from a git worktree: a
// `git add .` in either would pick up a dump placed inside it.
function getRepoRoots(): string[] {
  const fallbackRoot = path.resolve(SCRIPT_DIR, "../..");
  const topLevel = runGit(["rev-parse", "--show-toplevel"]);
  const commonDir = runGit([
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const roots = [
    fallbackRoot,
    topLevel,
    commonDir === null ? null : path.dirname(commonDir),
  ].filter((root): root is string => root !== null);
  return [...new Set(roots)];
}

function runGit(args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", SCRIPT_DIR, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // No git or not a checkout: the fallback root still guards this copy.
    return null;
  }
}

function guardDir(dir: string): string {
  const resolved = getRepoRoots().map((root) =>
    assertSafeMigrationDir(dir, root, NODE_FS),
  );
  return resolved[0];
}

function main(): number {
  const dir = process.env.MIGRATION_DIR ?? "";
  const shouldCreate = process.argv.includes("--create");

  let resolvedDir = guardDir(dir);
  if (shouldCreate && !NODE_FS.exists(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true, mode: PRIVATE_DIR_MODE });
    console.error(`Created ${resolvedDir} (mode 700).`);
    // Re-guard now that realpath can see the whole path.
    resolvedDir = guardDir(resolvedDir);
  }

  const stats = fs.statSync(resolvedDir, { throwIfNoEntry: false });
  if (stats === undefined || !stats.isDirectory()) {
    throw new Error(
      `MIGRATION_DIR "${resolvedDir}" does not exist or is not a directory. ` +
        "Run the preflight script to create it.",
    );
  }
  if ((stats.mode & GROUP_OTHER_BITS) !== 0) {
    throw new Error(
      `MIGRATION_DIR "${resolvedDir}" is accessible by other users. ` +
        "Run `chmod 700` on it, then re-run.",
    );
  }

  console.log(resolvedDir);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
