import assert from "node:assert/strict";
import { test } from "node:test";

import { diffAuthConfig } from "../../src/lib/region-migration/auth-config.ts";

// A slice of GET /v1/projects/{ref}/config/auth.
const OLD_CONFIG = {
  site_url: "https://app.example.com",
  uri_allow_list: "https://app.example.com/**",
  mailer_otp_exp: 3600,
  external_email_enabled: true,
  smtp_host: "smtp.example.com",
  smtp_pass: "hunter2-old-smtp",
  smtp_admin_email: "ops@example.com",
  external_google_secret: "hunter2-google",
};

test("reports nothing when the configs match", () => {
  assert.deepEqual(diffAuthConfig(OLD_CONFIG, { ...OLD_CONFIG }), []);
});

test("reports a plain setting that differs, with both values", () => {
  const newConfig = { ...OLD_CONFIG, site_url: "http://localhost:3000" };

  assert.deepEqual(diffAuthConfig(OLD_CONFIG, newConfig), [
    {
      key: "site_url",
      status: "changed",
      message:
        'site_url: "https://app.example.com" -> "http://localhost:3000"',
    },
  ]);
});

test("reports a key present on one side only", () => {
  const newConfig = Object.fromEntries(
    Object.entries(OLD_CONFIG).filter(([key]) => key !== "mailer_otp_exp"),
  );

  assert.deepEqual(diffAuthConfig(OLD_CONFIG, newConfig), [
    {
      key: "mailer_otp_exp",
      status: "changed",
      message: "mailer_otp_exp: 3600 -> (missing)",
    },
  ]);
});

test("masks a changed secret and never prints either value", () => {
  const newConfig = { ...OLD_CONFIG, smtp_pass: "hunter2-new-smtp" };

  const differences = diffAuthConfig(OLD_CONFIG, newConfig);

  assert.deepEqual(differences, [
    { key: "smtp_pass", status: "changed", message: "smtp_pass: <changed>" },
  ]);
  const output = JSON.stringify(differences);
  assert.doesNotMatch(output, /hunter2/);
});

test("treats every secret-like key name as a secret", () => {
  const keys = ["api_key", "jwt_token", "my_password", "smtp_pass", "SECRET"];
  const oldConfig = Object.fromEntries(keys.map((k) => [k, `old-${k}`]));
  const newConfig = Object.fromEntries(keys.map((k) => [k, `new-${k}`]));

  const output = JSON.stringify(diffAuthConfig(oldConfig, newConfig));

  assert.doesNotMatch(output, /old-|new-/);
});

test("reports a redacted secret as verify manually", () => {
  const oldConfig = { ...OLD_CONFIG, smtp_pass: "********" };

  assert.deepEqual(diffAuthConfig(oldConfig, OLD_CONFIG), [
    {
      key: "smtp_pass",
      status: "verify manually",
      message: "smtp_pass: verify manually (the API redacted the value)",
    },
  ]);
});

test("reports a secret that is empty or null on both sides as verify manually", () => {
  const oldConfig = { external_google_secret: null, smtp_pass: "" };

  assert.deepEqual(
    diffAuthConfig(oldConfig, { ...oldConfig }).map((d) => d.status),
    ["verify manually", "verify manually"],
  );
});

test("masks sms_test_otp, whose fixed codes work as logins", () => {
  const oldConfig = { sms_test_otp: "16135550100=123456" };
  const newConfig = { sms_test_otp: "16135550100=654321" };

  const differences = diffAuthConfig(oldConfig, newConfig);

  assert.deepEqual(differences, [
    {
      key: "sms_test_otp",
      status: "changed",
      message: "sms_test_otp: <changed>",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(differences), /123456|654321/);
});

test("still prints non-secret otp settings", () => {
  assert.deepEqual(
    diffAuthConfig({ mailer_otp_exp: 3600 }, { mailer_otp_exp: 600 }),
    [
      {
        key: "mailer_otp_exp",
        status: "changed",
        message: "mailer_otp_exp: 3600 -> 600",
      },
    ],
  );
});

test("reports a secret missing on one side as missing, not redacted", () => {
  const newConfig = Object.fromEntries(
    Object.entries(OLD_CONFIG).filter(([key]) => key !== "smtp_pass"),
  );

  assert.deepEqual(diffAuthConfig(OLD_CONFIG, newConfig), [
    {
      key: "smtp_pass",
      status: "verify manually",
      message: "smtp_pass: verify manually (missing in new)",
    },
  ]);
});

test("skips keys listed in ignoreKeys", () => {
  const newConfig = {
    ...OLD_CONFIG,
    site_url: "http://localhost:3000",
    smtp_pass: "hunter2-new-smtp",
  };

  assert.deepEqual(
    diffAuthConfig(OLD_CONFIG, newConfig, {
      ignoreKeys: ["site_url", "smtp_pass"],
    }),
    [],
  );
});

test("orders differences by key", () => {
  const newConfig = {
    ...OLD_CONFIG,
    smtp_host: "smtp.other.com",
    external_email_enabled: false,
    site_url: "http://localhost:3000",
  };

  assert.deepEqual(
    diffAuthConfig(OLD_CONFIG, newConfig).map((d) => d.key),
    ["external_email_enabled", "site_url", "smtp_host"],
  );
});
