import { readFileSync } from "node:fs";

// Relative import: run via tsx from outside the repo (see migration-dir.ts).
import {
  compareSnapshots,
  type MigrationSnapshot,
  type SnapshotMismatch,
} from "../../src/lib/region-migration/snapshot.ts";

// Usage: tsx compare-snapshots.ts <old.json> <new.json>
// Prints every mismatch and exits 1, or prints MATCH and exits 0. Mismatches
// are split into abort-worthy ones (rows, public schema, migration history)
// and service-version drift (0-row auth/storage tables, extensions).

const SNAPSHOT_KEYS = ["rowCounts", "publicObjects", "migrationVersions"];

function readSnapshot(file: string): MigrationSnapshot {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  const isSnapshotShaped =
    typeof parsed === "object" &&
    parsed !== null &&
    SNAPSHOT_KEYS.every((key) => key in parsed);
  if (!isSnapshotShaped) {
    throw new Error(
      `${file} is not a snapshot: expected keys ${SNAPSHOT_KEYS.join(", ")}`,
    );
  }
  // Safe: snapshot.sql in this folder emits exactly MigrationSnapshot.
  return parsed as MigrationSnapshot;
}

// Only the Auth/Storage services and installed extensions can differ by
// version between projects; public and migration history come wholly from our
// dump, so any gap there means the restore is wrong.
const SERVICE_SCHEMA_PREFIXES = ["auth.", "storage."];

function isDrift(
  mismatch: SnapshotMismatch,
  oldSnapshot: MigrationSnapshot,
  newSnapshot: MigrationSnapshot,
): boolean {
  if (mismatch.kind === "extension") return true;
  if (mismatch.kind !== "table") return false;

  const isServiceTable = SERVICE_SCHEMA_PREFIXES.some((prefix) =>
    mismatch.subject.startsWith(prefix),
  );
  const rows =
    oldSnapshot.rowCounts[mismatch.subject] ??
    newSnapshot.rowCounts[mismatch.subject] ??
    0;
  return isServiceTable && rows === 0;
}

function printGroup(title: string, mismatches: SnapshotMismatch[]): void {
  if (mismatches.length === 0) return;

  console.log(`${title} (${mismatches.length}):`);
  for (const mismatch of mismatches) {
    console.log(`  ${mismatch.message}`);
  }
}

function main(): number {
  const [oldFile, newFile] = process.argv.slice(2);
  if (oldFile === undefined || newFile === undefined) {
    throw new Error("usage: compare-snapshots.ts <old.json> <new.json>");
  }

  const oldSnapshot = readSnapshot(oldFile);
  const newSnapshot = readSnapshot(newFile);
  const mismatches = compareSnapshots(oldSnapshot, newSnapshot);
  const driftMismatches = mismatches.filter((mismatch) =>
    isDrift(mismatch, oldSnapshot, newSnapshot),
  );
  const dataMismatches = mismatches.filter(
    (mismatch) => !driftMismatches.includes(mismatch),
  );

  printGroup(
    "MISMATCHES: rows, public schema or migration history differ",
    dataMismatches,
  );
  printGroup(
    "Drift: a 0-row auth/storage table or an extension on one side only; " +
      "usually service-version drift, review each",
    driftMismatches,
  );
  if (mismatches.length === 0) {
    console.log("MATCH");
  } else if (dataMismatches.length > 0) {
    console.log(
      "NOT a match: the copy is incomplete. This is an abort criterion.",
    );
  } else {
    console.log("NOT a match: service-version drift only. Review above.");
  }
  return mismatches.length === 0 ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
