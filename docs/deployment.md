# Deployment

Deploys are driven by GitHub Actions (`.github/workflows/ci.yml`), not by Vercel's Git integration. `vercel.json` turns off Vercel Git deployments for every branch, so there are no preview deployments and no production deploys from Git.

## How it works

- **Pull request**: CI only (`app` checks, plus `db` checks when `supabase/**`, `src/types/database.ts` or the workflow changed). Nothing is deployed.
- **Merge to `main`**: CI runs again (`app` and `db`), then the `deploy` job:
  1. links the prod Supabase project and runs `supabase db push --linked --yes`;
  2. pulls the Vercel production settings, builds (`vercel build --prod`) and deploys (`vercel deploy --prebuilt --prod`).
- Migrations run first. If they fail, the job stops and the app never ships ahead of its schema.
- Deploys queue and never cancel (`deploy-prod` concurrency group, `cancel-in-progress: false`), so a deploy is never stopped mid-migration.
- The `deploy` job runs in the `Production` GitHub environment, which holds the prod secrets. Each step receives only the secrets it needs, as environment variables, never as command-line flags.

## One-time setup

Do these in order.

1. **Before the first merge with this pipeline**: run `supabase/checks/pricing_backfill_check.sql` against a restore of prod (B-04 in `.planning/STATE.md`), then bring prod up to date by hand. Otherwise the first automated deploy pushes every pending migration at once.
2. **Vercel**: create an access token (Account Settings > Tokens). Run `vercel link` locally; `orgId` and `projectId` are in `.vercel/project.json`.
3. **Supabase**: create a personal access token. Note the prod project ref and the prod DB password.
4. **GitHub > Settings > Environments > `Production`**: add these secrets, then set Deployment branches to "Selected branches and tags" = `main`.

   | Secret | Value |
   | --- | --- |
   | `VERCEL_TOKEN` | Vercel access token (step 2) |
   | `VERCEL_ORG_ID` | `orgId` from `.vercel/project.json` |
   | `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |
   | `SUPABASE_ACCESS_TOKEN` | Supabase personal access token (step 3) |
   | `SUPABASE_DB_PASSWORD` | Prod DB password |
   | `SUPABASE_PROJECT_ID` | Prod project ref |

5. **GitHub branch ruleset on `main`**: require a PR and the status checks `app` and `db`. A skipped `db` counts as passing.
6. **After merging**: check that Vercel creates no Git deployments for PRs, and that a merge makes exactly one production deployment, from the Action.
