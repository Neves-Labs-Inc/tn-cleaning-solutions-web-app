# Postgres hosting on AWS: options that fit the budget

Research for [#128](https://github.com/Neves-Labs-Inc/tn-cleaning-solutions-web-app/issues/128). Map: [#126](https://github.com/Neves-Labs-Inc/tn-cleaning-solutions-web-app/issues/126).
Feeds the "Database hosting choice" decision ([#135](https://github.com/Neves-Labs-Inc/tn-cleaning-solutions-web-app/issues/135)). This doc does not pick an option.

Researched 2026-10-12. Prices are USD on-demand list prices. Unless noted, they come from the AWS Price List bulk API (`pricing.us-east-1.amazonaws.com/offers/v1.0/aws/{AmazonRDS,AmazonEC2}/current/<region>/index.*`), pulled the same day. Monthly figures assume 730 hours.

Constraints from the map: the whole stack must stay under about $50/mo. Portable beats AWS-managed when the cost is similar. Prod plus local only. Toronto business. The AWS account is shared with another client and split by cost tags. Next.js hosting is still undecided, most likely serverless (Lambda) or a small container.

---

## 1. What the schema needs from Postgres

These come from `supabase/migrations/` and `supabase/config.toml`.

**Version.** Local runs `major_version = 17` (`supabase/config.toml`). Every option should offer PG 17. RDS and Aurora also offer PG 18 now (see §3).

**Extensions** (`CREATE EXTENSION` in `20260427000000_schema_snapshot.sql` and `20261009150000_…sql`):

| Extension | Schema | Used for | RDS PG 17 | Notes |
|---|---|---|---|---|
| `pgcrypto` | `extensions` | `gen_random_uuid()` was in core Postgres from PG 13, so `pgcrypto` is probably not needed | yes (1.3) | |
| `uuid-ossp` | `extensions` | not called anywhere in the migrations | yes (1.1) | Can probably be dropped |
| `unaccent` | `extensions` | invoice-number prefix: `extensions.unaccent('extensions.unaccent'::regdictionary, …)` in 2 functions | yes (1.1) | **Needed.** The schema-qualified dictionary reference needs an `extensions` schema to exist (or a rewrite) |
| `moddatetime` | `public` | `updated_at` triggers | yes (contrib-spi 1.0) | Needed |
| `pg_stat_statements` | `extensions` | observability only | yes (1.11) | Optional |
| `supabase_vault` | `vault` | not used by app code | **no** | Supabase-only. Drop it |
| `pgtap` (tests) | `extensions` | `supabase test db` in CI | yes (1.3.4) | Needed for CI/local tests |
| `pg_net` | n/a | dropped in `20260911155132_remote_schema.sql` | n/a | Already gone |

Source for RDS support: [RDS for PostgreSQL extensions](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html). Self-managed Postgres on EC2 can install all of these: they are contrib modules, except pgTAP, which is a packaged extension.

**Supabase-specific dependencies.** These block a plain dump and restore, whatever the host.

- **`auth` schema.** `auth.uid()` and `auth.jwt()` appear in 13 places across 5 migrations: RLS policies, helper functions, and clock-correction audit fields that read `user_metadata.full_name` from the JWT. `auth.users` is read by a function (email lookup) and is the target of the FK `employees_user_id_fkey → auth.users(id) ON DELETE CASCADE`. The Better Auth move replaces all of this.
- **PostgREST roles `anon`, `authenticated`, `service_role`.** About 230 `GRANT`/`REVOKE` lines naming these roles, `ALTER DEFAULT PRIVILEGES … TO anon/authenticated/service_role`, and 27 `CREATE POLICY` statements across 14 RLS-enabled tables. On a plain host these roles either have to be created or the grants rewritten. That is the "where authorization lives" decision.
- **`postgres` as owner.** Objects are owned by `postgres`, and defaults are `FOR ROLE "postgres"`. On RDS the master user can be named `postgres`, but it is a member of `rds_superuser`, not a true superuser. Nothing in the migrations obviously needs true superuser: no event triggers and no `supabase_admin`.
- **`supabase_realtime` publication.** `ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres"` in the snapshot. This is Supabase-only, so drop it. Logical replication also blocks Aurora auto-pause (see §3).
- **`extensions` and `private` schemas.** These are plain schemas and portable, but the `extensions` schema has to be created before the extensions are installed into it.
- 49 `SECURITY DEFINER` and 29 `security_invoker` objects. These are plain Postgres and portable, but they lean on the role model above.

Takeaway: every candidate host can run the schema's Postgres features. The portability work is the Supabase `auth` and role layer, not the host.

---

## 2. Comparison

ca-central-1 (Canada Central, Montréal) is the default region. The us-east-1 numbers are for reference.

| Option | ca-central-1 est. $/mo | us-east-1 est. $/mo | Backups / PITR | PG 17 + our extensions | Portability | Fit |
|---|---|---|---|---|---|---|
| **RDS PostgreSQL db.t4g.micro**, Single-AZ, 20 GB gp3 (2 vCPU, 1 GiB) | **~$15.70** (+$3.65 if public IPv4 → ~$19.30) | ~$14.00 (+$3.65) | Automated, up to 35 days PITR, restore to the second, latest restorable time typically within the last 5 min | Yes (no `supabase_vault`) | High: stock Postgres, `pg_dump` out | Fits, with room |
| **RDS PostgreSQL db.t4g.small**, Single-AZ, 20 GB gp3 (2 vCPU, 2 GiB) | ~$28.10 (+$3.65 → ~$31.70) | ~$25.70 (+$3.65) | same | Yes | High | Fits, little room |
| **Self-managed Postgres on EC2 t4g.small**, 20 GB gp3, public IPv4 | ~$18.85 (t4g.micro: ~$12.15) | ~$17.10 | DIY (e.g. WAL archiving to S3). No managed PITR | Yes, anything installable | Highest | Fits. You run patching and backups. Can share a box with a containerised app |
| **Aurora Serverless v2 (PostgreSQL)**, min 0 ACU (auto-pause) | $0 compute while paused + $0.14/ACU-h active + $0.11/GB-mo + $0.22/M I/O. E.g. 240 active h × 1 ACU ≈ $34 | $0.12/ACU-h, $0.10/GB-mo, $0.20/M I/O | Continuous backup, PITR | Yes | Lower (Aurora-only features, but wire-compatible) | Fits only if it really sleeps. A 0.5 ACU floor alone is ~$51/mo in ca |
| **Lightsail managed database**, Standard $15 (1 GB RAM, 40 GB SSD) | $15 (Canada price not shown on the pricing page) | $15 | Automatic, PITR in 5-min increments for 7 days | **PG 12–16 per the docs, not 17** | High | Fits on price, but behind on version and outside your VPC |
| **Share the other client's instance** (separate database) | ~$0 marginal | n/a | Inherits theirs | Inherits their version and extensions | Couples two clients | Cheapest, but cost tags can't split one instance, and shared blast radius and maintenance |

Add-ons that can break the budget:

| Add-on | ca-central-1 | us-east-1 |
|---|---|---|
| RDS Proxy on a t4g instance (2 vCPU) | $0.016/vCPU-h → **~$23.40/mo** | $0.015/vCPU-h → ~$21.90/mo |
| RDS Proxy on Aurora Serverless v2 | $0.018/ACU-h (and it stops auto-pause) | $0.015/ACU-h |
| NAT Gateway (needed if VPC-attached Lambda must reach the internet) | $0.05/h → **~$36.50/mo** + $0.05/GB | $0.045/h → ~$32.85/mo + $0.045/GB |
| Public IPv4 address (in-use or idle) | $0.005/h → $3.65/mo | same |
| Extra backup storage beyond the free allocation | $0.105/GB-mo (RDS), $0.023/GB-mo (Aurora) | $0.095, $0.021 |

### How the estimates were built (per-unit list prices)

| Item | ca-central-1 | us-east-1 | Source |
|---|---|---|---|
| RDS PG db.t4g.micro / small / medium, Single-AZ | $0.018 / $0.035 / $0.070 per h | $0.016 / $0.032 / $0.065 per h | Price List API, AmazonRDS |
| RDS gp3 storage | $0.127/GB-mo | $0.115/GB-mo | Price List API |
| RDS minimum storage | 20 GiB | 20 GiB | [RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| Aurora Serverless v2 (standard) | $0.14/ACU-h | $0.12/ACU-h | Price List API |
| Aurora Serverless v2 (I/O-Optimized) | $0.19/ACU-h | $0.16/ACU-h | Price List API |
| Aurora storage / I/O | $0.11/GB-mo, $0.22/M | $0.10/GB-mo, $0.20/M | Price List API |
| EC2 t4g.micro / small / medium (Linux) | $0.0092 / $0.0184 / $0.0368 per h | $0.0084 / $0.0168 / $0.0336 per h | Price List API, AmazonEC2 |
| EBS gp3 | $0.088/GB-mo | $0.080/GB-mo | Price List API |
| NAT Gateway | $0.05/h, $0.05/GB | $0.045/h, $0.045/GB | Price List API, [VPC pricing](https://aws.amazon.com/vpc/pricing/) |
| Public IPv4 | $0.005/h | $0.005/h | [VPC pricing](https://aws.amazon.com/vpc/pricing/) |

---

## 3. Key facts the decision rests on

### Cost and free tier
- **RDS backup storage is free up to your total provisioned DB storage in the region.** "Free backup storage is provided up to your account's total provisioned database storage across the entire region" ([RDS FAQ](https://aws.amazon.com/rds/faqs/)). A 20 GB instance with a small database pays roughly $0 for backups. Note that this allowance is **per account and region**, so it would be pooled with the other client's RDS usage in a shared account.
- **The free tier probably doesn't apply.** Accounts created before 2025-07-15 are on the Legacy Free Tier: 12 months from sign-up. New accounts get up to $200 in credits and a 6-month Free plan that covers db.t4g.micro and Aurora Serverless up to 4 ACU and 1 GiB ([RDS free tier](https://aws.amazon.com/rds/free/)). The shared account is presumably older than 12 months, so plan on list price. A new dedicated account would get the credits.
- ca-central-1 runs about 9–17% above us-east-1 for every item checked. On a ~$15–30 database that is $1.50–3/mo.

### Aurora Serverless v2 scale-to-zero
- Set min capacity to 0 ACU. The instance pauses after 5 min to 24 h with no user connections. **No instance charge while paused**, but storage is still billed ([auto-pause docs](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)).
- Needs Aurora PostgreSQL ≥ 13.15 / 14.12 / 15.7 / 16.3. Aurora PG 17 is GA (latest 17.11) and Aurora PG 18 is available too ([release notes](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraPostgreSQLReleaseNotes/AuroraPostgreSQL.Updates.html)). Canada (Central) is supported up to platform v4 ([how it works](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2.how-it-works.html)).
- **Resume takes ~15 s, or 30 s+ after more than 24 h paused.** Clients need retries and connect timeouts above 15–30 s. For an office app that is idle overnight, that means the first login of the day hangs.
- **Things that keep it awake:** any open user connection (a long-lived app pool in a container), **an attached RDS Proxy**, logical replication, and frequent pings. `pg_cron` jobs don't wake it and are skipped while paused.
- 1 ACU ≈ 2 GiB. With no pause, the 0.5 ACU floor is 0.5 × $0.14 × 730 ≈ **$51/mo** in ca-central-1, over budget on its own.
- The RDS Data API (HTTP, no persistent connection, no VPC needed from Lambda) works with Aurora PostgreSQL serverless and provisioned ([Data API](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/data-api.html)). It is not a standard Postgres wire protocol, so it cuts against "portable". Its result sets are capped at 1 MB ([quotas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html)).

### Connections from serverless hosts
- RDS PostgreSQL's default `max_connections` is `LEAST({DBInstanceClassMemory/9531392}, 5000)` ([RDS quotas](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Limits.html)). On a 1 GiB t4g.micro, that leaves on the order of ~100 connections after RDS reserves memory (estimate; check with `SHOW max_connections`). That is plenty for one small app with a small per-instance pool.
- **RDS Proxy** pools connections, but it **must sit in the same VPC as the DB and can't be publicly accessible**. Clients have to be in the VPC ([RDS Proxy limits](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html)). It costs ~$23/mo on a 2-vCPU t4g in ca-central-1. Other PG caveats: no `CancelRequest`, session pinning on statements over 16 KB, and an `rdsproxyadmin` user it creates. Its pricing page bills per second with a 10-minute minimum after a status change ([RDS Proxy pricing](https://aws.amazon.com/rds/proxy/pricing/)). A 2-vCPU minimum shows up only on the China-region page and in secondary sources, but t4g instances already have 2 vCPU.
- Portable alternatives to RDS Proxy: an in-app pool in a long-running container (no proxy needed), a small per-Lambda pool (max 1–2) with a low concurrency cap, or PgBouncer on a box you already run.

### Networking: public vs private, and NAT
- Lambda attached to a VPC **loses internet access** unless private subnets route through a **NAT gateway**. A Lambda in a public subnet doesn't get internet access either ([Lambda VPC internet](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)). The app needs outbound internet for email (SES), auth callbacks, and similar. In ca-central-1 a NAT gateway is **~$36.50/mo before data**, most of the budget. Gateway-type VPC endpoints (S3, DynamoDB) are free, but interface endpoints for other services are not.
- **Cheapest pattern with Lambda:** keep Lambda out of the VPC. Make the DB publicly accessible with TLS (`rds.force_ssl` is on by default in PG 17 on Aurora), a strong password or IAM auth, and a security group. The cost is $3.65/mo for the public IPv4. The trade-off is a DB endpoint reachable from the internet, because Lambda has no fixed egress IPs to allow-list.
- **Cheapest pattern with a container:** the app and DB in the same VPC, the app in a public subnet with its own IPv4 (no NAT) and the DB private. Or Postgres on the same EC2 box.
- Lightsail databases sit in Lightsail's own VPC. To reach them from regular AWS resources you need Lightsail VPC peering, or else a public endpoint.

### Lightsail limits
- The [database docs](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-choosing-a-database.html) list PostgreSQL **12–16**, with no 17. That would mean downgrading from local PG 17 or waiting.
- The Standard $15 plan has 1 GB RAM, 1 core, 40 GB SSD and 100 GB transfer, with **no encryption at rest** (encryption starts at the $30 plan) ([Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)).
- PITR is in 5-minute increments over 7 days ([Lightsail PITR](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-a-database-from-point-in-time-backup.html)). ca-central-1 is a Lightsail region ([regions](https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-regions-and-availability-zones-in-amazon-lightsail.html)), but the pricing page shows no Canada-specific database price.

### Sharing an instance with the other client
- Cost allocation tags attach to **resources**. One RDS instance carries one set of tags, so its cost can't be split between clients by tags. You would need a manual split, or a separate account (AWS Organizations consolidated billing) for clean attribution.
- Coupling: shared Postgres major version, extensions, parameter group, maintenance window, `max_connections`, and blast radius (a noisy neighbour or a breach). It contradicts "portable" in spirit, because the database's lifecycle is tied to another client's.

### Region
- ca-central-1 supports RDS PostgreSQL, Aurora Serverless v2 (platform v4) and Lightsail. The Price List API has `CAN1-*` SKUs for every RDS and Aurora item above. Data residency in Canada is available at a ~10–15% premium.

### Versions
- RDS for PostgreSQL: 17 (latest 17.11) and 18 (latest 18.6) are available ([RDS PG versions](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html)). RDS Extended Support (extra per-vCPU-hour fees) applies only after a major version leaves standard support, so stay on a current major.

---

## 4. Open questions for the decision ticket

1. App hosting: Lambda (pushes toward a public DB or a NAT bill) or a small container (makes a private DB and an in-app pool cheap)? This mostly determines the networking cost.
2. Is a 15–30 s cold resume for the first request after idle acceptable? If not, Aurora auto-pause is out.
3. A dedicated AWS account (free-tier credits, clean billing, its own backup allowance) or the shared one?
4. Is managed PITR (RDS, Aurora, Lightsail) a must, or is DIY WAL-to-S3 on EC2 acceptable?
5. Canada residency (ca-central-1) or us-east-1 (cheaper, wider service availability)?
