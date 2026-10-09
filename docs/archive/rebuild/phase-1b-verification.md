# Phase 1B verification

## Preserved behavior

- Sidebar expands from a 64px rail and retains permission-filtered navigation.
- The sidebar calendar opens at 264px and supports day selection, week jumps,
  previous/next month, Today, active-week emphasis, and date markers.
- Calendar day and week choices navigate the Schedule route through URL state.

## Changed and improved

- Supabase Auth now owns real browser sessions when configured.
- Fastify validates bearer tokens through Supabase Auth before resolving context.
- Postgres RLS is the tenant boundary for workspaces, memberships, location scopes,
  preferences, and append-only audit events.
- The local stack runs on `55321`-`55329` to avoid the existing Organizer stack.

## Intentionally omitted

- Hosted Supabase configuration and hosted migration execution.
- The location domain itself; membership scopes currently hold opaque future IDs.
- Important Dates and Closed Days persistence, which belongs to Organization Basics.
- Full Schedule Grid, publish flow, blockers, and edit locking, which remain Phase 5.

## Evidence boundary

- `supabase db reset --local` proves the local migration and synthetic seed replay.
- `supabase test db` proves eight RLS tenant, role, and audit checks against local Postgres.
- Auth and API smoke checks prove the synthetic local account resolves the same
  owner workspace through GoTrue, PostgREST, and Fastify.
- Old-app runtime visual parity remains unverified until a stable read-only old-app
  runtime can be captured. Static source behavior informed this implementation.
