// Reads OLD_DB_URL / NEW_DB_URL from env (never argv). Usage:
//   tsx db-target.ts host VAR       prints the URL's hostname
//   tsx db-target.ts no-password VAR
//       checks the URL (and its project ref against OLD/NEW_PROJECT_REF when
//       set), then prints it without the password
//   tsx db-target.ts password VAR   prints the decoded password
//   tsx db-target.ts distinct       exits 1 if both URLs look like one database
// no-password and password print secrets-adjacent values: callers capture them
// into shell variables and never print them.

const URL_VARS = ["OLD_DB_URL", "NEW_DB_URL"] as const;
type UrlVar = (typeof URL_VARS)[number];

const PROJECT_REF_VARS: Record<UrlVar, string> = {
  OLD_DB_URL: "OLD_PROJECT_REF",
  NEW_DB_URL: "NEW_PROJECT_REF",
};

type DbTarget = { host: string; user: string; projectRef: string | null };

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
// Session pooler users are "<role>.<ref>"; direct hosts are "db.<ref>.supabase.co".
const POOLER_USER_PATTERN = /^[^.]+\.([a-z0-9]+)$/;
const DIRECT_HOST_PATTERN = /^db\.([a-z0-9]+)\.supabase\.co$/;
// The local stack has no project ref to check against.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function parseUrl(name: UrlVar): URL {
  const parsed = URL.parse(process.env[name] ?? "");
  // Never include the value: it carries the password.
  if (parsed === null || !POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${name} is not a postgresql:// connection URL`);
  }
  if (parsed.hostname === "" || parsed.username === "") {
    throw new Error(`${name} must include a user and a host`);
  }
  return parsed;
}

function readTarget(name: UrlVar): DbTarget {
  const parsed = parseUrl(name);
  const host = parsed.hostname.toLowerCase();
  const user = decodeURIComponent(parsed.username);
  const projectRef =
    POOLER_USER_PATTERN.exec(user)?.[1] ??
    DIRECT_HOST_PATTERN.exec(host)?.[1] ??
    null;
  return { host, user, projectRef };
}

// Catches a swapped OLD/NEW URL before readonly-on locks the wrong project.
// Skipped only when the ref var is unset (scripts that need it require it).
function assertExpectedRef(name: UrlVar): void {
  const refVar = PROJECT_REF_VARS[name];
  const expectedRef = process.env[refVar] ?? "";
  const { host, projectRef } = readTarget(name);
  if (expectedRef === "") return;

  if (projectRef === null && !LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Cannot tell which project ${name} points at (host ${host}). Use the ` +
        "Session pooler string (user postgres.<ref>) or db.<ref>.supabase.co.",
    );
  }
  if (projectRef !== null && projectRef !== expectedRef) {
    throw new Error(
      `${name} points at project ${projectRef}, but ${refVar} is ${expectedRef}. ` +
        "Are OLD and NEW swapped?",
    );
  }
}

function getUrlWithoutPassword(name: UrlVar): string {
  assertExpectedRef(name);
  const parsed = parseUrl(name);
  parsed.password = "";
  return parsed.toString();
}

function isSameDatabase(oldTarget: DbTarget, newTarget: DbTarget): boolean {
  const isSameRef =
    oldTarget.projectRef !== null &&
    oldTarget.projectRef === newTarget.projectRef;
  const isSameHostAndUser =
    oldTarget.host === newTarget.host && oldTarget.user === newTarget.user;
  return isSameRef || isSameHostAndUser;
}

function readUrlValue(command: string, name: UrlVar): string | null {
  if (command === "host") return readTarget(name).host;
  if (command === "no-password") return getUrlWithoutPassword(name);
  if (command === "password") {
    return decodeURIComponent(parseUrl(name).password);
  }
  return null;
}

function isUrlVar(value: string | undefined): value is UrlVar {
  return URL_VARS.some((name) => name === value);
}

function main(): number {
  const [command, name] = process.argv.slice(2);
  const urlValue = isUrlVar(name) ? readUrlValue(command, name) : null;
  if (urlValue !== null) {
    console.log(urlValue);
    return 0;
  }
  if (command !== "distinct") {
    throw new Error(
      "usage: db-target.ts host|no-password|password OLD_DB_URL|NEW_DB_URL" +
        " | distinct",
    );
  }

  const oldTarget = readTarget("OLD_DB_URL");
  const newTarget = readTarget("NEW_DB_URL");
  const isSame = isSameDatabase(oldTarget, newTarget);
  if (isSame) {
    console.error(
      `OLD_DB_URL (user "${oldTarget.user}" on ${oldTarget.host}) and ` +
        `NEW_DB_URL (user "${newTarget.user}" on ${newTarget.host}) ` +
        "look like the same database.",
    );
  }
  return isSame ? 1 : 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
