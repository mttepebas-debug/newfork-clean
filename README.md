# Newfork

Multi-tenant restaurant scheduling SaaS. pnpm monorepo: `apps/web`, `apps/api`,
`packages/shared`, `packages/ui`, `supabase/`.

## Commands

```powershell
pnpm.cmd install
pnpm.cmd supabase:start
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:db
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd dev
```

Focused checks: `pnpm.cmd --filter @newfork/web exec vitest run <file>`,
`pnpm.cmd --filter @newfork/web typecheck`.

Dev ports: web `5555`, API `5556`. Local Supabase uses ports `55321`-`55329`.
The synthetic local account is `owner@newfork.test`; its local-only password is
in `supabase/seed.sql`. `pnpm.cmd supabase:reset` wipes the local DB.

Copy `.env.example` to `.env.local` files and fill in values; env files are not
committed.

Shared locks (`db.lock`, `main.lock`, see CLAUDE.md §7): `node scripts/lock.mjs take <db|main> "<role/session, purpose>"`
(identity must be `role/session`, e.g. `"nf-test/fb61-11, migration trial"`), `release <db|main> "<role/session>"`,
or `status` — `take`/`release` exit 1 on conflict instead of overwriting. Covered by `pnpm.cmd test`
(runs `node --test scripts/lock.test.mjs` first).

Current schema: `supabase/schema.sql` is a read-only dump of the `public` and `app_private`
schemas as the migrations build them; read it for a function's or policy's current definition.
After adding a migration run `pnpm.cmd db:schema` (throwaway database, never the shared one) and
commit the file with it. `pnpm.cmd lint` warns when the file is older than the migrations; CI's
db job compares it with a fresh dump.

## Plan

Working rules: [`CLAUDE.md`](CLAUDE.md). Current plan: [`docs/plan/EKRAN-PLANI.md`](docs/plan/EKRAN-PLANI.md); tasks and backlog live in `docs/plan/`.
`docs/archive/rebuild/` is historical reference only.
