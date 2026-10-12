// Relative import: run via tsx from outside the repo (see migration-dir.ts).
import {
  diffAuthConfig,
  type AuthConfig,
} from "../../src/lib/region-migration/auth-config.ts";

// Read-only: GETs both projects' auth config from the Management API and prints
// the differing fields, secrets masked. The token comes from env and only ever
// travels in a request header. Exits 1 when a field differs outright.

const MANAGEMENT_API = "https://api.supabase.com/v1/projects";
// Project refs are short lowercase ids; anything else must not reach the URL.
const PROJECT_REF_PATTERN = /^[a-z0-9]+$/;

function readEnv(name: string): string {
  const value = process.env[name] ?? "";
  if (value === "") throw new Error(`Missing required env var ${name}`);
  return value;
}

function readProjectRef(name: string): string {
  const ref = readEnv(name);
  if (!PROJECT_REF_PATTERN.test(ref)) {
    throw new Error(`${name} must be a project ref (lowercase letters/digits)`);
  }
  return ref;
}

async function fetchAuthConfig(ref: string, token: string): Promise<AuthConfig> {
  const response = await fetch(`${MANAGEMENT_API}/${ref}/config/auth`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  // Status only: an error body is not ours to vouch for.
  if (!response.ok) {
    throw new Error(
      `GET auth config for project ${ref} failed: HTTP ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error(`Auth config for project ${ref} is not a JSON object`);
  }
  // Safe: checked above to be a plain object; diffAuthConfig treats values as unknown.
  return body as AuthConfig;
}

async function main(): Promise<number> {
  const token = readEnv("SUPABASE_ACCESS_TOKEN");
  const oldRef = readProjectRef("OLD_PROJECT_REF");
  const newRef = readProjectRef("NEW_PROJECT_REF");

  const [oldConfig, newConfig] = await Promise.all([
    fetchAuthConfig(oldRef, token),
    fetchAuthConfig(newRef, token),
  ]);
  const differences = diffAuthConfig(oldConfig, newConfig);
  for (const difference of differences) {
    console.log(difference.message);
  }

  const changedCount = differences.filter(
    (difference) => difference.status === "changed",
  ).length;
  const manualCount = differences.length - changedCount;
  console.log(
    `${changedCount} field(s) differ, ${manualCount} to verify manually ` +
      `(old ${oldRef}, new ${newRef}).`,
  );
  return changedCount === 0 ? 0 : 1;
}

main().then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
