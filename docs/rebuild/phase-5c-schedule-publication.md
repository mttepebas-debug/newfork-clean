# Phase 5C Schedule publication

Status: implemented and locally verified on 2026-08-17. Phase 5D has not started.

## Delivered

- Independent `schedule.publish` capability for Owner, Admin, and Manager roles,
  with PostgreSQL-enforced manager location scope and custom-role prerequisites.
- Named-draft, location-scoped publication preview with canonical added, updated,
  removed, unchanged, and resulting shift counts.
- Hard overlap blocking plus availability and closure overrides with a required,
  per-finding 10-500 character manager reason.
- Atomic publish commits with revision and fingerprint checks, immutable publication
  versions and shift snapshots, supersession links, override audit records, and
  append-only publish events.
- Separately previewed, location-scoped unpublish with stale-preview rejection,
  retained snapshots/history, and republish version increments.
- A scoped publication-history API returning versions visible to the actor.
- Two-step publish and unpublish dialogs with responsive containment, dark-theme
  contrast, blocker states, override inputs, and explicit final confirmation.

## Preserved

- Publication starts from a saved draft and never from dirty editor state.
- Location selection, preflight review, stale-preview protection, partial-location
  publication, hard/soft findings, and separately confirmed unpublish remain.
- Unselected locations keep their current publication and unpublish does not delete
  prior versions or their shift snapshots.

## Changed and improved

- PostgreSQL recomputes and locks the complete plan at commit time. The client cannot
  bypass scope, blocker, revision, active-version, or fingerprint invariants.
- Department-partial publication is replaced by whole-location publication, avoiding
  a location that appears live while containing mixed draft and published content.
- Past-week closure depends only on workspace week settings and current date. Payroll,
  worked shifts, time entries, jurisdictions, and compliance are not consulted.
- Publication history is service-readable and actor-scoped instead of exposing audit
  tables directly to authenticated browser clients.

## Intentionally omitted

- Employee notification recipients and delivery side effects.
- Templates, auto-fill, and export, which remain Phase 5D.
- Payroll, labor, overtime, time-entry, tips, compliance, and jurisdiction fields or
  routes.
- Deep links from findings into grid shifts. The finding includes canonical shift IDs,
  but the current grid has no stable focus contract for those links.

## Research-derived ideas

- Per-finding reasons replace a single blanket override so every approved exception
  remains attributable after later publication versions.
- Immutable version snapshots and append-only events leave a clean boundary for a
  future notification consumer without adding notification behavior to publication.

## Verification

- Clean `supabase db reset` replay passed through the Phase 5C migration.
- Focused publication pgTAP passed 28 tests. Full pgTAP passed 11 files and 266 tests.
- Root typecheck, lint, unit/integration tests, and production build passed. The build
  retains the existing Vite warning for a main chunk above 500 kB.
- API tests cover canonical scope forwarding, independent capability denial, history,
  hard-blocker status mapping, and stale-preview conflict mapping.
- Real owner API smoke saved a published-copy draft, received `override_required`,
  published with an audited reason, read three history versions, unpublished, and
  republished. The final read model contained the expected seven shifts.
- Browser UAT published Garden Room with a closure override, confirmed unpublish while
  retaining history, and republished it. Main Dining remained untouched.
- At a 390 x 844 viewport, the publication dialog measured 352 px content and scroll
  width inside a 390 px document. A dark-theme screenshot exposed and then verified
  the correction of location-label contrast.

## Evidence boundary

The clean local database, API, component, desktop browser, and mobile layout paths are
verified. Old application behavior remains static-source evidence; an old/new runtime
comparison has not been completed, so exact visual parity is still unverified.

## Approval gate

Stop after Phase 5C. Phase 5D templates, auto-fill, and export require separate user
approval.
