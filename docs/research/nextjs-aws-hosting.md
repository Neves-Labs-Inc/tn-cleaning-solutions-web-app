# Next.js 16 hosting options on AWS (research for #127)

Researched 2026-10-12. Map: #126. Feeds the "Next.js hosting choice" decision (#136).
This note compares options. It does not pick one.

Prices are USD on-demand list prices. Most are **us-east-1**. Canada (Central) runs about 10% higher where checked (EC2 t4g.small: $0.0184/h in ca-central-1 vs $0.0168/h in us-east-1). Monthly figures use 730 h. Postgres is **not** included: it is priced in its own ticket, but it takes a large share of the ~$50/mo budget.

## What this app needs from a host

Checked against this repo (`package.json`, `src/`, `next.config.ts`):

| Feature | Used? | Detail |
| --- | --- | --- |
| Next version | `next@16.2.4`, React 19.2.4 | `reactCompiler: true` (build-time only) |
| Proxy (`src/proxy.ts`) | Yes | It checks the session cookie on `/solutions/*` and redirects to `/login`. Today it calls Supabase. After the move it will call Better Auth. |
| Server Actions | Heavy | They live in `src/lib/actions/*.ts` (clients, jobs, invoices, appointments, attendance, ...). |
| On-demand revalidation | `revalidatePath(...)` in server actions | There is no `revalidateTag`, no `'use cache'`, and no time-based ISR config. |
| `next/image` | **Not used** | Image optimization is irrelevant today. |
| Traffic | Tiny | It is an internal back-office app for one cleaning business. |

Facts from the Next 16.2.4 docs in `node_modules/next/dist/docs/`:

- **Proxy runs on Node.js only in Next 16.** "Proxy defaults to using the Node.js runtime. The `runtime` config option is not available in Proxy files. Setting the `runtime` config option in Proxy will throw an error." (`01-app/03-api-reference/03-file-conventions/proxy.md` §Runtime). A host that can only run Edge middleware cannot run this app's proxy.
- **A plain Node server supports everything.** "A single `next start` process handles every Next.js feature correctly: Server Components, ISR, PPR, Cache Components, Server Actions, Proxy, and `after()`" (`01-app/02-guides/deploying-to-platforms.md` §Minimum Requirements). The deploying table also says Node.js server and Docker get "All" features (`01-app/01-getting-started/17-deploying.md`).
- **Server Actions require streaming** in the feature matrix ("POST requests with streaming response"). On-demand ISR needs a shared cache only when there are several instances (`deploying-to-platforms.md` §Feature Support Matrix).
- **Verified adapters are only Vercel and Bun.** AWS Amplify is listed under "Other Platforms ... not verified by the Next.js team, so feature support and compatibility may vary." OpenNext is not listed. SST is listed only as a Docker-hosting template (`17-deploying.md` §Adapters, §Docker).

## Comparison

| Option | Next 16 fit (proxy / actions / revalidate / image) | Est. app-hosting $/mo at our traffic | Cold starts | Ops burden | Portability | Reaching Postgres on RDS |
| --- | --- | --- | --- | --- | --- | --- |
| **OpenNext + SST on Lambda + CloudFront** | Works, with a caveat. Node proxy is bundled into the server function. Actions and ISR are supported, with DynamoDB + SQS for revalidation. Next 16 needs a version bump (see below). | **~$0–3** (Lambda free tier, CloudFront Free plan). **+$33** if it needs a NAT gateway | Yes. Optional `warm` cron | Low–medium. SST/OpenNext moves fast | Medium. App code is unchanged, but the infra is SST-specific | Lambda outside a VPC means a public RDS endpoint. Inside a VPC it needs NAT, a NAT instance, or VPC endpoints to reach anything on the internet |
| **Amplify Hosting** | **Risky.** The docs say "up through Next.js 15". Streaming and on-demand ISR are listed as unsupported | **~$0–5** (allowances, then $0.30/M requests and $0.20/GB-h) | Yes (Lambda-backed) | Lowest | Low (AWS-managed) | No VPC attach is documented, so RDS would need to be public |
| **App Runner** | Full (container) | ~$5 idle (1 GB) plus active vCPU | No | Low | High (container) | VPC connector. **Closed to new customers** |
| **ECS Fargate (Express Mode)** | Full (`next start` in Docker) | **~$30–40**: ALB ~$16.4 + LCU, Fargate 0.5 vCPU/1 GB ARM ~$14.4, public IPv4s ~$7–11 | No | Medium | High (container) | Same VPC with a security group. Private subnets would need NAT for egress |
| **Lightsail container service** | Full (`next start` in Docker) | **$10** (Micro: 0.25 vCPU, 1 GB) or $15 (Small: 0.5 vCPU, 1 GB). HTTPS endpoint included | No | Low | High (container) | VPC peering with the region's **default VPC** only. Or a Lightsail managed DB from $15 |
| **Small EC2 (t4g.small)** | Full (`next start` behind Caddy or nginx) | **~$18** in ca-central-1: $13.43 instance, ~$1–2 EBS, $3.65 public IPv4 | No | Highest: patching, TLS, process manager, deploys over SSH/SSM | Highest (any VM) | Same VPC with a security group. No NAT, because it sits in a public subnet |
| **Lightsail instance (VM)** | Full | **$7–12** for a 1–2 GB bundle with IPv4 included | No | High (same as EC2) | Highest | VPC peering with the default VPC |

## Key facts per option

### OpenNext / SST (Lambda + CloudFront)

- **Next 16 support works but is version-gated.** The OpenNext compatibility page lists tested versions only up to Next 15.3.2 and says nothing about 16 ([opennext.js.org/aws/compatibility](https://opennext.js.org/aws/compatibility)). The releases do ship Next 16 fixes, for example v4.1.6 "Register the composable cache handler at the top-level `cacheHandlers` config key for Next.js 16" and v4.1.1 "Fix `server/instrumentation.js does not exist` build failure on Next.js 16" ([releases](https://github.com/opennextjs/opennextjs-aws/releases)).
- **The peer range excludes our version.** Per `npm view @opennextjs/aws peerDependencies`, the latest `@opennextjs/aws@4.1.9` requires `next: '>=15.5.27 <16 || >=16.3.8'`. Our `16.2.4` falls outside it, so adopting OpenNext means bumping Next to ≥16.3.8 (`latest` is 16.4.0). `@opennextjs/aws@3.10.3` allowed `>=16.2.3`.
- **Node proxy is handled.** `createMiddleware.ts` on `main` detects Node middleware through `functions-config-manifest` `/_middleware`. It then runs `buildBundledNodeMiddleware` by default, or `buildExternalNodeMiddleware` when `middleware.external` is set ([source](https://github.com/opennextjs/opennextjs-aws/blob/main/packages/open-next/src/build/createMiddleware.ts)).
- **SST deploys these resources:** a Lambda server function, an image optimizer function, an S3 asset bucket, a CloudFront CDN, a DynamoDB table for ISR revalidation data, and an SQS queue that triggers the revalidator. It also has a `vpc` option and a `warm` option (a "serverless cron job to make _n_ concurrent requests ... every few minutes", default 0). For Next 15+ SST auto-selects OpenNext **3.9.14** by default ([sst.dev Nextjs component](https://sst.dev/docs/component/aws/nextjs/)), so it must be overridden to a 16-capable version. The latest `sst` on npm is 4.17.2.
- **Cost inputs:**
  - Lambda: 1M requests and 400,000 GB-s per month free, then $0.20/M requests and $0.0000166667/GB-s on x86 ([Lambda pricing](https://aws.amazon.com/lambda/pricing/)).
  - CloudFront: the flat-rate **Free plan is $0/month per distribution** and includes 1M requests and 100 GB transfer, with no overage charges. Pro is $15/month ([CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/)).

### Amplify Hosting

- "You can deploy apps built with Next.js versions up through Next.js 15". The unsupported list includes "Edge middleware", "*On-Demand* Incremental Static Regeneration (ISR)", "Next.js streaming", and `unstable_after` ([Amplify docs](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html)). This app uses `revalidatePath` (on-demand) and Server Actions, which need streaming per the Next docs. **There is no first-party statement that Next 16 is supported.** Only third-party posts report that `@aws-amplify/adapter-nextjs` 1.7.0 widened its peer range to 16.
- Supported runtimes are Node.js 20, 22, and 24 ([SSR supported features](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-supported-features.html)).
- Pricing:
  - Builds: 1,000 build-min/month free, then $0.01/min.
  - Data transfer out: 15 GB free, then $0.15/GB.
  - SSR requests: 500k free, then $0.30/M.
  - SSR duration: 100 GB-h free, then $0.20/GB-h.

  The page labels the allowances "Free for 12 months" ([Amplify pricing](https://aws.amazon.com/amplify/pricing/)).
- No first-party docs describe attaching Amplify SSR compute to a VPC. The only answers found were community re:Post threads saying it isn't supported, so this is unverified. In practice it means a publicly reachable RDS.

### App Runner: effectively ruled out

- "AWS App Runner is no longer open to new customers. Existing customers can continue to use the service as normal ... we do not plan to introduce new features. We recommend ... Amazon ECS Express Mode" ([availability change](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)). The cutoff was 30 April 2026. Whether the shared AWS account counts as an "existing customer" is unknown, and the service is frozen either way.
- Pricing for reference: $0.007/GB-h provisioned (charged even when idle) and $0.064/vCPU-h active ([App Runner pricing](https://aws.amazon.com/apprunner/pricing/)).

### ECS Fargate / ECS Express Mode

- Express Mode provisions "a Fargate-based ECS service with a unique accessible URL, load balancer with SSL/TLS, auto scaling policies, monitoring, and networking". It has "no additional charge" and shares ALBs across Express services that use the same networking configuration ([ECS Express Mode](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html)). AWS publishes a GitHub Action for it (`aws-actions/amazon-ecs-deploy-express-service`), which fits CI on GitHub Actions.
- **The ALB is the cost floor.** It costs $0.0225/h (about $16.43/mo) plus $0.008/LCU-h. The ALB free tier (750 h) applies only to new AWS customers ([ELB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/)).
- **Fargate ARM** costs $0.0000089944/vCPU-s and $0.0000009889/GB-s, which is about $0.0324/vCPU-h and $0.0036/GB-h. The minimum task is 0.25 vCPU / 0.5 GB ([Fargate pricing](https://aws.amazon.com/fargate/pricing/)).
- Public IPv4 costs $0.005/h (about $3.65/mo) per address, in use or idle. A NAT gateway costs $0.045/h (about $33/mo) plus $0.045/GB ([VPC pricing](https://aws.amazon.com/vpc/pricing/)).

### Lightsail (containers or a VM)

- Container service: Nano is $7 (0.25 vCPU, 512 MB), Micro $10 (0.25 vCPU, 1 GB), Small $15 (0.5 vCPU, 1 GB). Each "includes a data transfer quota of 500 GB per month".
- VM bundles with IPv4: $5 (0.5 GB), $7 (1 GB), $12 (2 GB), $24 (4 GB).
- Managed Postgres starts at $15/mo (1 GB, 40 GB SSD, no HA) ([Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)).
- "To enable VPC peering in Lightsail, you must have a default VPC in your AWS Region. The peering relationship will be between your resources in Lightsail and those in your default VPC" ([Lightsail VPC peering](https://docs.aws.amazon.com/lightsail/latest/userguide/lightsail-how-to-set-up-vpc-peering-with-aws-resources.html)). An RDS instance would have to live in the default VPC. The shared account may already use that VPC for the other client.

### Small EC2

- t4g.small (2 GiB) costs $0.0184/h in ca-central-1, or $0.0168/h in us-east-1. t4g.micro (1 GiB) costs $0.0092/h in ca-central-1 (AWS public price list, EC2 Linux on-demand).
- It runs a Node server or Docker, so every Next feature works. The build should use `output: "standalone"` (Next Docker example).
- A single instance needs no shared cache for `revalidatePath`.

## Cross-cutting facts the decision rests on

1. **A Node server or container gets full Next 16 fidelity with no adapter risk.** Lambda-based hosting depends on OpenNext (unverified by Next, and it needs a Next bump) or Amplify (documents only up to Next 15, with no streaming and no on-demand ISR).
2. **The ALB (~$16/mo) and the NAT gateway (~$33/mo) are what break the budget**, not compute. Any option that needs either one uses a large part of the ~$50 before Postgres is counted.
3. **Lambda in a VPC loses internet egress.** "Connecting a function to a public subnet doesn't give it internet access", so it needs a NAT gateway ([Lambda VPC internet](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)). The cheaper ways out:
   - (a) Keep Lambda outside the VPC and expose RDS publicly with TLS and strong credentials.
   - (b) Use interface VPC endpoints at $0.01/h per AZ per endpoint, about $7.30/mo each ([PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/)), for SES and Secrets Manager.
   - (c) Run a self-managed NAT instance.
4. **Fixed-price, always-on options make costs predictable.** They also avoid cold starts on the login-protected back office:
   - Lightsail container at $10–15.
   - Lightsail VM at $7–12.
   - EC2 at about $18.
5. **Portability ranks:** container or VM first (the same Docker image runs anywhere), then OpenNext (portable app, SST-specific infra), then Amplify (AWS-managed).
6. **The app does not use `next/image`**, so image-optimization support doesn't separate the options today.
7. **Region:** prices above are mostly us-east-1. Check ca-central-1 availability for the shortlisted service at decision time (EC2 is confirmed priced there).

## Open questions for the hosting decision

- Is a publicly reachable RDS endpoint (TLS plus a security group or password) acceptable? If so, Lambda/OpenNext stays cheap. If not, it needs NAT, endpoints, or a NAT instance.
- Is it acceptable to bump Next to ≥16.3.8 to stay inside OpenNext's supported peer range?
- Does the shared account's default VPC suit Lightsail peering, or does it collide with the other client?
- Does "Postgres on AWS" mean RDS? Self-hosted Postgres on the same EC2 or Lightsail VM would change the totals a lot.
