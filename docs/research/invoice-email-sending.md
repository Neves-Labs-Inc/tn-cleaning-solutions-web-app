# Research: Sending invoices to clients by email

Issue #47 (child of map #43, "Automatic invoicing"). Repo facts were checked against `origin/main` at `28e6f0f` on 2026-10-07. Provider facts come from the provider's own docs, fetched the same day. Prices and limits change, so check them again before signing up.

## Answer in brief

- **The app cannot email clients today.** It sends only Supabase Auth emails: the employee invite and the password reset. There is no email SDK, no SMTP code, no email env var, and nothing that renders an invoice as a PDF or a public link.
- **Supabase Auth email cannot do this job.** It only sends Auth messages. Its built-in sender delivers only to the project's team, at 2 messages per hour.
- **What it would take:** a transactional email provider called from a server action (Resend is the cheapest fit), a verified sending subdomain set up with 3 DNS records, an invoice email template, and either a PDF renderer or a public, token-protected invoice page.
- **Cost at this volume: $0.** The Resend Free plan (3,000 emails a month, 100 a day) easily covers one cleaning business's invoices.

## 1. What the repo has today

| Item | Finding | Source |
|---|---|---|
| Email SDKs or PDF libraries | None. No `resend`, `nodemailer`, `@sendgrid/*`, `postmark`, `mailgun`, `@react-pdf/*`, `pdfkit` or `puppeteer`. | `package.json` |
| Env vars | Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_APP_URL`. No `.env.example` is committed. `docs/local-setup.md` mentions `.env.local.example`, but that file is not in git. | `grep process.env src scripts`, `git ls-files` |
| Emails sent | (1) An employee invite through `auth.admin.inviteUserByEmail`. (2) A password reset through `auth.resetPasswordForEmail`. Both are Supabase Auth emails. | `src/lib/actions/employees.ts:180`, `src/app/(auth)/forgot-password/page.tsx:35` |
| Templates | One custom Auth template, `supabase/templates/invite-email.html`. In production it is pasted into Supabase Dashboard > Auth > Email Templates by hand. | `docs/email-templates.md`, `supabase/config.toml:239-241` |
| SMTP config | Local only. Inbucket/Mailpit runs at `localhost:54324` (`[local_smtp]`). The `[auth.email.smtp]` block is commented out, with SendGrid shown as the example. `auth.rate_limit.email_sent = 2`. **We don't know if the production Supabase project has custom SMTP set up.** That setting lives in the Dashboard, not the repo. | `supabase/config.toml:99-102,190-192,230-237` |
| Client email | `clients.email` exists as nullable `text`, so some clients may have no email address. | `supabase/migrations/20260427000000_schema_snapshot.sql:198-209` |
| Invoice model | `invoices`: `status` is one of draft/issued/paid/void, plus `issued_date`, `due_date`, `total_cents` and `notes`. There is no `sent_at` and no public token. The admin-only RLS policy means an unauthenticated client cannot read an invoice. | schema snapshot `:243-255`, `:558` |
| Invoice rendering | Admin pages only (`/solutions/invoices/[id]`). No print stylesheet, no PDF, no public route. | `grep -ri "pdf\|print" src` (no hits) |

## 2. Why Supabase Auth email cannot send invoices

- The built-in sender delivers only to project team members. Anyone else gets "Email address not authorized". It is limited to **2 messages per hour**, has no SLA, and is meant only for demos. ([Supabase: Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp))
- Custom SMTP in Supabase only changes how *Auth* messages are delivered (invites, magic links, OTPs, confirmations). It adds no API for sending your own email. The same page advises keeping Auth email apart from other email. ([same source](https://supabase.com/docs/guides/auth/auth-smtp))
- So invoices need their own provider API, called from a Next.js server action, for example inside or next to `issueInvoice` in `src/lib/actions/invoices.ts`.
- Side note: in production, invites and password resets to non-team addresses only work if the live project already has custom SMTP. We could not check this from the repo. Whichever provider is chosen can also serve as that SMTP.

## 3. Provider: Resend (recommended) vs Postmark

| | Resend | Postmark |
|---|---|---|
| Free tier | $0: 3,000 emails/mo, **100/day**, 3 domains, 30-day log retention | $0: 100 emails/mo, no overage |
| First paid tier | Pro, $20/mo: 50,000/mo, no daily cap | Basic, $15/mo: 10,000/mo, then $1.80 per 1,000 |
| API rate limit | 10 requests/second per team (default) | not checked |
| Attachments | `attachments[]` with `content` (Buffer or base64) or a hosted `path`. Max **40 MB per email after base64 encoding** | not checked |
| Node SDK | `resend` (`new Resend(apiKey)`, `resend.emails.send({ from, to, subject, html \| react, attachments })`). `react` accepts a React component, so templates can be TSX in the repo. | not checked |
| Sources | [pricing](https://resend.com/pricing), [send-email API](https://resend.com/docs/api-reference/emails/send-email), [API intro](https://resend.com/docs/api-reference/introduction) | [pricing](https://postmarkapp.com/pricing) |

Resend wins because its free tier covers this volume and it has a TSX-friendly SDK. Postmark is the obvious alternative if deliverability reputation matters more than cost. Amazon SES and SendGrid were not compared here.

## 4. Sender domain and DNS

- Resend sends only from a domain you **own and have verified**. It does not use shared domains for sending. It recommends a subdomain such as `billing.<domain>` over the root domain, to keep sending reputation separate. ([Resend: Domains](https://resend.com/docs/dashboard/domains/introduction))
- Verification takes 3 records on the sending subdomain: an **MX** on `send` (priority 10, a region-specific SES host), an **SPF TXT** on `send` (`v=spf1 include:amazonses.com ~all`), and a **DKIM TXT** on `resend._domainkey`. ([Resend registrar guides, e.g. Cloudflare](https://resend.com/docs/dashboard/domains/cloudflare))
- Adding a DMARC TXT record (`_dmarc`) is recommended. Gmail requires SPF *or* DKIM from all senders, and SPF *and* DKIM *and* DMARC only from bulk senders (more than 5,000 a day). A small business is not a bulk sender, but DMARC is cheap insurance. ([Google: Email sender guidelines](https://support.google.com/a/answer/81126))
- **Unknown: does the business own a domain, and who controls its DNS?** This blocks everything else.
- If the root domain already receives mail through Google Workspace, putting Resend's MX on the `send` subdomain does not touch the root MX. Only changing the root MX would break inbound mail. ([Resend Namecheap guide](https://resend.com/docs/dashboard/domains/namecheap))

## 5. PDF or link

| Option | What it needs | Trade-off |
|---|---|---|
| **Link** to a public invoice page | A new `invoices.public_token` (random, unguessable) and a public route such as `/(public)/invoice/[token]` that reads the invoice through the service-role client or a security-definer function. Today's RLS is admin-only. | No new rendering library, and the invoice always shows its current status (paid/void). The link is a bearer secret, and some clients prefer a file. |
| **PDF attachment** | A server-side PDF renderer (not in deps today; `@react-pdf/renderer` is one choice, not evaluated here), whose output goes in Resend `attachments` as a Buffer. 40 MB is far more than one invoice needs. | The client gets a self-contained file. Adds a dependency and a second invoice layout to keep in sync. Whether it runs on the deploy target has not been checked. |
| Both | Link in the body plus a PDF attached | Most work |

## 6. Other things the feature needs

- Env vars: `RESEND_API_KEY` (server-only) and a sender address such as `INVOICE_FROM_EMAIL="TN Cleaning Solutions <billing@billing.<domain>>"`. Add them to a committed `.env.example`, which does not exist yet.
- Data: a `sent_at` / `last_sent_to` on `invoices` (or a send log) so admins can see what went out. Block sending when `clients.email` is null.
- Template: subject, amount (`total_cents` → USD), due date, the link or attachment, and how to pay. Writing it as a TSX component keeps it in the repo, unlike the Auth template, which is pasted into the Dashboard.
- Limits for automatic invoicing (#43): the Free plan's **100 emails/day** cap applies to batch sends. Use Resend's idempotency key so a retry does not double-send.

## Open questions

1. Does the business own a domain, and who manages its DNS?
2. Does the production Supabase project already use custom SMTP (Dashboard > Auth > SMTP)?
3. Should clients get a link, a PDF, or both?
4. How many invoices go out per month (to confirm the free tier holds)?
