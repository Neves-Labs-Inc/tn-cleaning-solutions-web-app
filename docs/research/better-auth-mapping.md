# Better Auth mapping: invites, password reset, admin/employee roles

Research for [#129](https://github.com/Neves-Labs-Inc/tn-cleaning-solutions-web-app/issues/129) (map: #126). Researched 2026-10-12 against **better-auth 1.7.7** (npm latest) and the Better Auth repo at commit [`876ee03`](https://github.com/better-auth/better-auth/tree/876ee038ec0ec7c26180880755f46ab79aee2132). Doc links below point at the MDX sources in that commit (`docs/content/docs/...`), which are what better-auth.com renders.

Abbreviations: **BA** = Better Auth. `BA-docs:/x` = `https://github.com/better-auth/better-auth/blob/876ee03/docs/content/docs/x.mdx`. `BA-src:/x` = `https://github.com/better-auth/better-auth/blob/876ee03/packages/better-auth/src/x`.

## TL;DR

- **Core + 2 plugins cover everything:** core `emailAndPassword` (sign-in, sign-out, reset, change password), the **`admin` plugin** (roles, server-side user creation, set password, ban/remove), and **`nextCookies`** (sets cookies from server actions). Nothing else is needed.
- **Don't use `organization`** (its invites require the invitee to already have a signed-in account — wrong shape for us) or **`magic-link`** (works, but a 5-minute default link and passwordless sign-in we don't want).
- **Invite = `admin.createUser` with no password + `requestPasswordReset` pointed at `/accept-invite`.** BA's reset endpoint creates the credential account if the user has none (`BA-src:/utils/password.ts`, `resetCredentialPassword`). There is no first-class "invite user" endpoint for a single-tenant app — that's the main custom glue.
- **Roles:** define `admin` and `employee` with the admin plugin's access control (`createAccessControl`), `defaultRole: "employee"`. Role lands in a `user.role` text column and on `session.user.role` — replaces `app_metadata.role`.
- **Schema:** 4 tables (`user`, `session`, `account`, `verification`) + admin plugin's `user.role/banned/banReason/banExpires` and `session.impersonatedBy`. Set `advanced.database.generateId: "uuid"` so `employees.user_id uuid` can FK to `"user"(id)`.
- **Adapters:** raw `pg` and Kysely use the built-in Kysely adapter (only path where `npx auth migrate` works); Drizzle and Prisma have adapters but you `generate` the schema and migrate with the ORM.
- **Next.js 16:** `proxy.ts` runs on Node by default, so `auth.api.getSession({ headers })` can run there; BA and Next both recommend cookie-only checks in proxy (`getSessionCookie`) and real checks in layouts/actions.
- **Biggest gap (not BA's job):** ~35 SQL references to `auth.uid()` / `auth.jwt()` / `get_user_role()` in RLS and SECURITY DEFINER functions have no BA equivalent. Identity must be passed into Postgres another way, or authorization moves into the app — that belongs to the "where does authorization live" ticket.

## Flow-by-flow mapping

| # | Flow | Today (Supabase) | Better Auth equivalent | Notes |
|---|---|---|---|---|
| 1 | Sign in | `client.auth.signInWithPassword` in a server action (`src/app/(auth)/login/page.tsx`) | `auth.api.signInEmail({ body: { email, password }, headers })` in the server action, with `nextCookies()` plugin | Without `nextCookies` the cookie is not set from a server action (BA-docs:/integrations/next "Server Action Cookies"). Set `emailAndPassword.disableSignUp: true` — no public sign-up. |
| 2 | Sign out | `supabase.auth.signOut()` (`solutions/signOutAction.ts`) | `auth.api.signOut({ headers })` | Same server-action shape. |
| 3 | Session in proxy | `createServerClient(...).auth.getUser()` + cookie sync in `src/proxy.ts` | `getSessionCookie(request)` from `better-auth/cookies` (optimistic), or `auth.api.getSession({ headers })` (full DB check; allowed because Next 16 proxy is Node-only) | No token refresh dance; the `syncCookies` helper goes away. Proxy matcher already excludes `/api`, so `/api/auth/*` is untouched. |
| 4 | Session in layouts/pages/actions | `supabase.auth.getUser()` (~20 call sites) | `auth.api.getSession({ headers: await headers() })` → `{ user, session }` | Wrap in one `getCurrentUser()` / `requireAdmin()` helper in a DAL. RSCs can't refresh the cookie cache (BA-docs:/integrations/next warning). |
| 5 | Role check | `user.app_metadata?.role === 'admin'` (layouts + `requireAdminRole` in 7 action files) | `session.user.role === 'admin'`, or `auth.api.userHasPermission(...)` | `role` comes from the admin plugin. |
| 6 | Invite employee | `auth.admin.inviteUserByEmail(email, { redirectTo: /accept-invite })` → `updateUserById(app_metadata.role='employee')` → upsert `employees` (`src/lib/actions/employees.ts:180`) | `auth.api.createUser({ body: { email, name, role: 'employee' }, headers })` (no `password`) → upsert `employees` → `auth.api.requestPasswordReset({ body: { email, redirectTo: '/accept-invite' } })` | Role is set atomically at create. Passing `headers` makes BA check the caller's `user:create` permission; omitting them = trusted server call (BA-src:/plugins/admin/routes.ts `createUser`). Custom: choosing the invite vs reset email template (see gaps). |
| 7 | Accept invite | Client page: `verifyOtp({ token_hash, type: 'invite' })` or implicit-flow hash `setSession` → `updateUser({ password })` → `completeProfile` server action | Link hits `GET /api/auth/reset-password/:token?callbackURL=/accept-invite`, which validates **without consuming** and redirects to `/accept-invite?token=…` (or `?error=INVALID_TOKEN`). Form posts to a server action: `auth.api.resetPassword({ body: { token, newPassword } })` → `auth.api.signInEmail` → upsert profile | `resetPassword` does **not** create a session, so the action must sign in afterwards and needs the email (see gaps). The page can become a server-rendered form; the implicit-flow hash branch disappears. |
| 8 | Forgot password | `client.auth.resetPasswordForEmail(email, { redirectTo: /update-password })` | `auth.api.requestPasswordReset({ body: { email, redirectTo: '/update-password' } })` + `emailAndPassword.sendResetPassword` callback | Always returns success (no enumeration). We send the email ourselves (SES ticket). Token TTL: `resetPasswordTokenExpiresIn`, default 3600 s. |
| 9 | Update password (from reset link) | `verifyOtp({ token_hash, type: 'recovery' })` on submit, then `updateUser({ password })` | `auth.api.resetPassword({ body: { token, newPassword } })` | BA's GET callback doesn't spend the token, so the "verify only on submit, scanners burn tokens" concern in `update-password/page.tsx` is handled by BA's design. Consider `revokeSessionsOnPasswordReset: true`. |
| 10 | Change password (profile) | `supabase.auth.updateUser({ password })` (`src/lib/actions/profile.ts`) | `auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions }, headers })` | **Behaviour change:** BA requires the current password. Today's form doesn't ask for it — add a field. |
| 11 | Admin-side user ops | `auth.admin.listUsers / createUser / updateUserById` (`scripts/seed-admin-users.ts`) | `auth.api.listUsers`, `createUser` (with `password` for seeds), `setRole`, `setUserPassword`, `banUser`, `removeUser` | Seed script calls without headers = trusted. BA also ships `npx auth create-admin`. |
| 12 | Get a user's email | SQL `get_user_email(uuid)` reading `auth.users` | Read `"user".email` directly (it's a normal table now) | Function becomes a plain join or is dropped. |
| 13 | Deactivate employee | Only `employees.is_active=false`; auth user can still sign in (gated in app) | Same, optionally plus `auth.api.banUser` / `revokeUserSessions` to cut access at the auth layer | Optional hardening. |
| 14 | Cutover: everyone resets | n/a | Create BA users from `auth.users` (id, email, name, role) with **no** `account` row; send each a reset/invite link | BA reset creates the credential account on first reset, so no hash import. Keep the same UUIDs so `employees.user_id` and audit columns stay valid. |

Sources for the table: BA-docs:/authentication/email-password, BA-docs:/plugins/admin, BA-docs:/integrations/next, BA-docs:/concepts/session-management, BA-src:/api/routes/password.ts, BA-src:/utils/password.ts, BA-src:/plugins/admin/routes.ts.

## Plugins

| Plugin | Use? | Why |
|---|---|---|
| core `emailAndPassword` | **Yes** | Sign-in, reset, change password. `disableSignUp: true`, `minPasswordLength: 8` (default, matches today), `sendResetPassword`, `revokeSessionsOnPasswordReset`. |
| `admin` | **Yes** | `role` column, server-side `createUser` (password optional — "useful for magic link or social login only users"), `setRole`, `setUserPassword`, ban, sessions, impersonation. |
| `nextCookies` (`better-auth/next-js`) | **Yes** | Must be the **last** plugin; sets cookies from server actions. |
| `organization` | No | Multi-tenant model; `acceptInvitation` requires a logged-in session whose email matches the invite (BA-docs:/plugins/organization), so the invitee needs an account first. |
| `magic-link` | No (fallback) | Could carry invites (`disableSignUp`, `expiresIn` default 300 s), but signs the user in without a password; reusing the reset flow is simpler. |
| `email-otp`, `2fa`, `jwt`, `bearer` | No | Not in scope. `jwt` would only matter if we choose to pass identity to Postgres as a signed JWT. |

### Role config sketch

```ts
import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access'

const ac = createAccessControl(defaultStatements)
const roles = {
  admin: ac.newRole({ ...adminAc.statements }),
  employee: ac.newRole({ user: [], session: [] }),
}

admin({ ac, roles, defaultRole: 'employee' })
```

With `roles` defined, `createUser`/`setRole` reject any role not in the map (`YOU_ARE_NOT_ALLOWED_TO_SET_NON_EXISTENT_VALUE`, BA-src:/plugins/admin/routes.ts). Without custom AC only `admin` and `user` are valid (BA-docs:/plugins/admin "Admin Roles" warning), so the custom AC is needed to name the role `employee`.

## Schema Better Auth adds

From BA-docs:/concepts/database ("Core Schema") and BA-docs:/plugins/admin ("Schema"):

| Table | Columns |
|---|---|
| `user` | `id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt` + admin: `role`, `banned`, `banReason`, `banExpires` |
| `session` | `id`, `userId`, `token`, `expiresAt`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt` + admin: `impersonatedBy` |
| `account` | `id`, `userId`, `accountId`, `providerId` (`credential` for passwords), `accessToken`, `refreshToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, `scope`, `idToken`, `password` (scrypt hash), `createdAt`, `updatedAt` |
| `verification` | `id`, `identifier` (e.g. `reset-password:<token>`), `value` (user id), `expiresAt`, `createdAt`, `updatedAt` |

Decisions this forces:

- **IDs:** `advanced.database.generateId: "uuid"` makes `id` a UUID column, so `employees.user_id uuid REFERENCES "user"(id) ON DELETE CASCADE` replaces today's FK to `auth.users` (`20260427000000_schema_snapshot.sql:500`). Cutover inserts users with their existing Supabase UUIDs.
- **Naming:** tables are singular camelCase by default (`"user"` is a reserved word in Postgres and needs quoting). `modelName` / `fields` can rename them (e.g. `auth_user`, snake_case columns), or `database.schemaName` / `search_path` can put them in an `auth` schema (BA-docs:/adapters/postgresql "Use a non-default schema").
- **Full name:** `user.name` is required. Today `employees.full_name` is the source of truth and the invite only has a name from the admin form; pass it as `name` at `createUser`. `clock_corrections` snapshots `auth.jwt()->'user_metadata'->>'full_name'`, which maps to `"user".name`.
- **Sessions are DB rows** (7-day expiry, sliding every 1 day by default). Optional `session.cookieCache` (signed cookie, e.g. 5 min) to skip the DB on most reads; revocation then lags up to `maxAge`.

## Adapter options per data-access library

| Library | BA adapter | Schema / migrations | Notes |
|---|---|---|---|
| Raw `pg` | Built-in Kysely adapter: `database: new Pool({ connectionString })` | `npx auth migrate` applies directly, or `npx auth generate` emits SQL to commit as a migration | Simplest; BA uses Kysely internally even if the app doesn't. Supports `advanced.database.joins`. |
| Kysely | Same built-in adapter; pass a `PostgresDialect` or an existing `Kysely` instance | Same as raw `pg` | Share one pool with the app. Generate types for BA tables with the app's Kysely codegen. |
| Drizzle | `drizzleAdapter(db, { provider: 'pg', schema })` from `@better-auth/drizzle-adapter` | `npx auth generate` writes a Drizzle schema → `drizzle-kit generate/migrate`. `auth migrate` not supported | Pass `transaction: true` so reset + session revocation are atomic (BA-docs:/authentication/email-password). Relations must be passed in the schema object. |
| Prisma | `prismaAdapter(prisma, { provider: 'postgresql' })` from `better-auth/adapters/prisma` | `npx auth generate` writes Prisma models → `prisma migrate dev`. `auth migrate` not supported | Also needs `transaction: true` for atomic reset. |

Sources: BA-docs:/adapters/postgresql, BA-docs:/adapters/drizzle, BA-docs:/adapters/prisma, BA-docs:/concepts/database ("Programmatic migrations only work with the built-in Kysely adapter").

Whatever we pick, migrations should stay plain SQL files under one tool so pgTAP keeps running on them; `auth generate` output gets committed rather than `auth migrate` running at deploy.

## Next.js 16 integration notes

- **Route handler:** `src/app/api/auth/[...all]/route.ts` → `export const { GET, POST } = toNextJsHandler(auth)` (BA-docs:/integrations/next).
- **Proxy:** Next 16 proxy runs on Node and the `runtime` option is not allowed there (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` "Runtime"). Next's auth guide says proxy should do optimistic cookie checks only, because it runs on every route including prefetches (`01-app/02-guides/authentication.md` "Optimistic checks with Proxy"). Use `getSessionCookie(request)` in `src/proxy.ts`, and keep the real `getSession` + role check in `(internal)/layout.tsx`, `(admin)/layout.tsx` and each server action. `getSessionCookie` only checks the cookie exists — it is not a security check (BA-docs:/integrations/next warning).
- **Server actions:** call `auth.api.*` with `headers: await headers()`; `nextCookies()` sets cookies. The browser client (`better-auth/react`) isn't needed if every auth form stays a server action, which matches today's pattern except the client-side accept-invite page.
- **Cookies:** `better-auth.session_token` (prefix configurable), httpOnly, `secure` in production (BA-docs:/concepts/cookies). Needs `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in env; `redirectTo` / `callbackURL` must be same-origin or in `trustedOrigins` (enforced by `originCheck` in BA-src:/api/routes/password.ts).

## Gaps that need custom code

1. **Invite orchestration (small).** No single "invite user" call. Our `inviteEmployee` action does `createUser` → `employees` upsert → `requestPasswordReset(redirectTo: /accept-invite)`. Resend-invite = call `requestPasswordReset` again.
2. **Two email templates from one callback.** `sendResetPassword({ user, url, token })` serves both invite and reset. Branch on the `callbackURL` inside `url` (`/accept-invite` vs `/update-password`) to pick the invite or recovery template. Templates move out of `supabase/templates/*` (Go-template `{{ .ConfirmationURL }}`) into our SES sender — the email ticket.
3. **One TTL for both links.** `resetPasswordTokenExpiresIn` (default 1 h) applies to invites too; an invite opened the next day would fail. Options: raise it (e.g. 24–48 h) for both, or mint invite tokens ourselves by inserting a `verification` row `reset-password:<token>` with a longer `expiresAt` — the standard `/reset-password` endpoint consumes either.
4. **Sign-in after accept-invite.** `resetPassword` returns `{ status: true }` with no session. The accept-invite action must look up the email (read the `verification` row for the token before resetting, or ask for email on the form), then `signInEmail`, then save the profile. Alternatively, merge password + profile into one form and send the user to `/login` afterwards.
5. **Change-password needs the current password.** Add a field to the profile form, or use admin `setUserPassword` on the user's own id (not recommended — bypasses re-auth).
6. **Postgres-side identity (largest).** RLS policies and SECURITY DEFINER functions use `auth.uid()`, `auth.jwt()`, and `get_user_role()` (reads `app_metadata.role` from the JWT) — about 35 references across migrations (counting `get_employee_id()` too), e.g. `get_employee_id()`, `employee_appointment_ids()`, clock corrections, invoice functions. BA puts nothing in Postgres session state. Either (a) the app runs queries in a transaction with `set_config('app.user_id', …, true)` / `set_config('app.role', …, true)` and shim functions `auth.uid()` / `get_user_role()` read those settings, or (b) authorization moves into the app and RLS is dropped. Decide in the authorization ticket, not here.
7. **`createAdminClient` call sites** (8 files) use the Supabase service role for both auth admin and RLS bypass; the auth half maps to `auth.api.*` calls without headers, the data half depends on the data-access decision.
8. **Cutover script.** Copy `auth.users` → `"user"` (id, email, `raw_user_meta_data.full_name` or `employees.full_name` → `name`, `raw_app_meta_data.role` → `role`, `email_verified = true`), no `account` rows, then bulk-send reset links. Nothing in BA does this.
9. **Seeds/local dev.** `scripts/seed-admin-users.ts` rewrites onto `auth.api.createUser` with a password (server call, no headers).

## Open questions for later tickets

- Table naming (`"user"` vs `auth_user` vs an `auth` schema) — tie to the data-access library choice.
- Enable `session.cookieCache`? Saves a DB query per request; revocation lag up to `maxAge`.
- Rate limiting: BA has built-in rate limiting, stored in memory by default — check behaviour with more than one app instance once hosting is picked (BA-docs:/concepts/rate-limit, not read in depth here).
