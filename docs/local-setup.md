# TN Cleaning Solutions — Local Development Setup

## Prerequisites

- Docker Desktop installed and running
- Supabase CLI installed (`brew install supabase/tap/supabase` on macOS)
- Node.js 18+ and npm

## Local Supabase Setup

### 1. Start Supabase Services

From the project root:

```bash
supabase start
```

This will:
- Start PostgreSQL, Auth, Storage, and other Supabase services in Docker
- Output local credentials and URLs
- Launch Supabase Studio at http://localhost:54323

**Note:** First run takes a few minutes to pull Docker images.

### 2. Copy Environment Variables

After `supabase start` completes, it outputs local credentials. Create `.env.local`:

```bash
cp .env.local.example .env.local
```

Then update `.env.local` with the values from `supabase start` output:
- `NEXT_PUBLIC_SUPABASE_URL` → API URL (usually http://127.0.0.1:54321)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon key
- `SUPABASE_SERVICE_ROLE_KEY` → service_role key

### 3. Apply Migrations

All migrations are in `supabase/migrations/`. To apply them:

```bash
supabase db reset
```

This will:
- Drop and recreate the database
- Run all migration files in order
- Run `supabase/seed.sql` to create the first admin user

### 4. Start Next.js Dev Server

```bash
npm run dev
```

Visit http://localhost:3000

### 5. Add Test Appointment Data

After seeding users, create the schedule test data with the seeded employee accounts:

```bash
npm run seed:admin
npx supabase db query --file supabase/test-data.sql --local
```

This creates the Johnson Family client, the Standard House Cleaning job, and a today-only appointment assigned to both employee accounts.

## Database Tests

pgTAP tests live in `supabase/tests/database/`. Each file builds its own fixtures inside a
transaction and rolls back, so they don't need `seed.sql` or `test-data.sql`. Run them against a
freshly reset local stack:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

## Useful Commands

| Command | Purpose |
|---------|---------|
| `supabase start` | Start local Supabase (Docker) |
| `supabase stop` | Stop local Supabase |
| `supabase status` | Show running services and URLs |
| `supabase db reset` | Reapply all migrations + seed |
| `supabase db diff` | Generate migration from local schema changes |
| `supabase db pull <name>` | Create migration file from current schema |
| `supabase migration list` | List all migrations |

## Accessing Supabase Studio

Once `supabase start` is running, access the web UI:
- **URL:** http://localhost:54323
- **Features:** Table editor, SQL editor, Auth users, Storage browser

## Troubleshooting

### Docker Not Running
```
Error: Cannot connect to the Docker daemon
```
**Fix:** Start Docker Desktop

### Port Conflicts
If ports 54321-54323 are in use:
```bash
supabase stop
# Kill any conflicting processes
supabase start
```

### Reset Everything
```bash
supabase stop
supabase db reset
supabase start
```

## Next Steps

After local setup:
1. Verify migrations applied: Check Supabase Studio → Table Editor
2. Log in with seed admin user (credentials in `supabase/seed.sql`)
3. Start building features!