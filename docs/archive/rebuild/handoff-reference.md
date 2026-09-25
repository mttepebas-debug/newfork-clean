# Clean Rebuild Handoff Reference

This project was initialized from the clean rebuild direction stored outside this repo:

```text
C:\Users\TheWe\newfork\docs\clean-rebuild-ai-handoff
```

Those documents are product context, not repo-local agent instructions. Do not convert them into an `AGENTS.md` file unless the user explicitly requests it.

## Reference Boundary

Old Newfork reference path:

```text
C:\Users\TheWe\newfork
```

Use the old project as read-only reference material. Exact-port surfaces may use old behavior as source of truth; other surfaces should be redesigned or re-evaluated according to the approved phase plan.

## Phase 0 Decisions

- New project folder: `C:\Users\TheWe\Documents\Codex\newfork-clean`
- Repo shape: TypeScript pnpm workspace monorepo with Turborepo.
- Web app candidate: React 19, Vite, React Router, TanStack Query.
- API candidate: Fastify.
- Shared contracts: Zod.
- Database/auth candidate: Supabase Postgres and Supabase Auth, deferred to Phase 1 implementation approval.
- Handoff docs: referenced externally instead of copied into this repo.

## Exact-Port Surfaces

- Left sidebar / app shell
- Calendar
- Main Schedule page
- Employee Drawer shell

## Forbidden Legacy Domains

Do not import old implementation, data models, migrations, endpoints, tests, or UI assumptions for:

- time entries
- manager timesheets
- employee time tracking
- clock-in / clock-out
- breaks
- kiosk / Device Hub
- payroll setup / payroll handoff
- pay entity setup
- overtime / double overtime
- jurisdiction logic
- labor law logic
- sick leave / accrual
- compliance logic

These are future blank-slate domains and require separate approval before design or implementation.

## Next Checkpoint

Before Phase 1 implementation, confirm:

- whether Supabase is approved for auth and database,
- whether old Newfork should be inspected for sidebar/calendar exact-port behavior,
- what visual parity proof is expected for exact-port app shell and calendar,
- what tenant/role/location authorization model should be implemented first.
