// Diffs two auth configs as returned by the Supabase Management API
// (GET /v1/projects/{ref}/config/auth): a flat object of scalar settings.
// Secret-like values never reach the output; the result is safe to print.

export type AuthConfig = Record<string, unknown>;

export type AuthConfigDifferenceStatus = "changed" | "verify manually";

export type AuthConfigDifference = {
  key: string;
  status: AuthConfigDifferenceStatus;
  message: string;
};

export type DiffAuthConfigOptions = {
  // Keys whose difference is expected (e.g. a project-specific URL).
  ignoreKeys?: string[];
};

const SECRET_KEY_PATTERN = /secret|password|pass|key|token/i;
// Secrets the name pattern misses. sms_test_otp maps test numbers to fixed codes that work as
// logins; a broad /otp/ would also hide plain settings like mailer_otp_exp.
const EXTRA_SECRET_KEYS = new Set(["sms_test_otp"]);
const REDACTED_PATTERN = /^\*+$/;
const MISSING_LABEL = "(missing)";

export function diffAuthConfig(
  oldConfig: AuthConfig,
  newConfig: AuthConfig,
  options: DiffAuthConfigOptions = {},
): AuthConfigDifference[] {
  const ignored = new Set(options.ignoreKeys ?? []);
  const keys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

  return [...keys]
    .filter((key) => !ignored.has(key))
    .toSorted()
    .flatMap((key) => {
      const difference = diffKey(key, oldConfig[key], newConfig[key]);
      return difference === null ? [] : [difference];
    });
}

function diffKey(
  key: string,
  oldValue: unknown,
  newValue: unknown,
): AuthConfigDifference | null {
  const isSecret = SECRET_KEY_PATTERN.test(key) || EXTRA_SECRET_KEYS.has(key);
  if (isSecret && (looksRedacted(oldValue) || looksRedacted(newValue))) {
    return {
      key,
      status: "verify manually",
      message: `${key}: verify manually (${unreadableReason(oldValue, newValue)})`,
    };
  }
  if (isSameValue(oldValue, newValue)) return null;

  const message = isSecret
    ? `${key}: <changed>`
    : `${key}: ${formatValue(oldValue)} -> ${formatValue(newValue)}`;
  return { key, status: "changed", message };
}

function unreadableReason(oldValue: unknown, newValue: unknown): string {
  if (oldValue === undefined) return "missing in old";
  if (newValue === undefined) return "missing in new";
  return "the API redacted the value";
}

// The API may null, blank or star out secrets, so equality on those says nothing.
function looksRedacted(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (typeof value === "string" && REDACTED_PATTERN.test(value))
  );
}

function isSameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatValue(value: unknown): string {
  return value === undefined ? MISSING_LABEL : JSON.stringify(value);
}
