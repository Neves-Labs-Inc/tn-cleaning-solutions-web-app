import path from "node:path";

// The dump directory holds password hashes and customer PII, so it must never sit where
// git could pick it up. Filesystem access is injected so this module stays free of IO.

export type MigrationDirFs = {
  // Must not follow symlinks, so a dangling link still counts as present:
  // `(p) => fs.lstatSync(p, { throwIfNoEntry: false }) !== undefined`.
  exists: (path: string) => boolean;
  // Must resolve every symlink and canonicalize letter case, like fs.realpathSync.native
  // (plain fs.realpathSync keeps the caller's case on macOS).
  realpath: (path: string) => string;
};

// Returns the resolved directory. Write only there: the kernel follows a symlink before
// applying "..", so the raw string can land somewhere the guard never checked.
export function assertSafeMigrationDir(
  dir: string,
  repoRoot: string,
  fs: MigrationDirFs,
): string {
  if (!path.isAbsolute(dir)) {
    throw new Error(
      `MIGRATION_DIR must be an absolute path outside the repo, got "${dir}"`,
    );
  }

  const resolvedDir = resolveExisting(dir, fs);
  const resolvedRoot = resolveExisting(repoRoot, fs);
  if (isWithin(resolvedDir, resolvedRoot)) {
    throw new Error(
      `MIGRATION_DIR "${dir}" resolves to "${resolvedDir}", which is inside the repo ` +
        `(${resolvedRoot}). Pick a directory outside it.`,
    );
  }
  return resolvedDir;
}

// Realpaths the deepest part of the path that exists, so a not-yet-created directory
// under a symlinked parent still resolves to where it would really be written.
function resolveExisting(target: string, fs: MigrationDirFs): string {
  const normalized = path.resolve(target);
  let existing = normalized;
  while (!fs.exists(existing) && path.dirname(existing) !== existing) {
    existing = path.dirname(existing);
  }
  const rest = path.relative(existing, normalized);
  const base = fs.exists(existing) ? realpathOrThrow(existing, fs) : existing;
  return path.join(base, rest);
}

// A dangling symlink lands here: fail closed rather than guess where it points.
function realpathOrThrow(target: string, fs: MigrationDirFs): string {
  try {
    return fs.realpath(target);
  } catch (error) {
    throw new Error(
      `Cannot resolve "${target}" (a dangling symlink?). Point MIGRATION_DIR ` +
        "at a real directory outside the repo.",
      { cause: error },
    );
  }
}

function isWithin(target: string, root: string): boolean {
  // Lowercase both sides: fails closed on case-insensitive filesystems (macOS default).
  const relative = path.relative(root.toLowerCase(), target.toLowerCase());
  const isOutside =
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);
  return !isOutside;
}
