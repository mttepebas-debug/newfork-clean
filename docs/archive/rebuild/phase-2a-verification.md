# Phase 2A verification

## Preserved behavior

- Owner onboarding keeps resumable progress and workspace identity setup.
- Account Center remains user-scoped and reachable outside the active workspace shell.
- Linked workspace selection controls the active tenant context.

## Changed and improved

- Owner onboarding is a focused two-step foundation instead of importing legacy
  locations, jobs, invites, payroll, or compliance setup.
- Profile and theme preferences are user-owned and isolated from tenant rows.
- Workspace creation, activation, and onboarding updates use transactional Postgres
  functions protected by authenticated identity and RLS.
- Account and onboarding routes are lazy-loaded.

## Intentionally omitted

- Employee onboarding implementation; research and design approval remain required.
- SSN collection or storage; only the future security boundary is acknowledged.
- Email/password mutation, session management, and connected accounts.
- Locations, jobs, roles, documents, scheduling settings, and invitations, which
  belong to Phase 3 or later approved phases.

## Evidence boundary

- supabase db reset --local proves both migrations and the synthetic seed replay.
- supabase test db proves thirteen local RLS, role, profile, onboarding, audit,
  and owner-workspace bootstrap checks.
- Browser verification proves local GoTrue login, resumable onboarding, completion,
  account navigation, profile save, theme persistence, responsive layout, and a
  clean console.
- Hosted Supabase and old-app runtime parity remain unverified.
