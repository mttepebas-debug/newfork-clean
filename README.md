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

## Plan

Current plan, tasks and backlog live in [`docs/plan/`](docs/plan/ROADMAP.md).
`docs/archive/rebuild/` is historical reference only.
