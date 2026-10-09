# Phase 6A Schedule Line-up

Status: implementation and local acceptance completed on 2026-08-17. Phase 6B has not
started and remains subject to separate user approval.

## Preserved behavior

- `/app/schedule/lineup` is a daily manager surface sourced from current published
  Schedule versions. Line-up changes are stored as overlays and do not mutate published
  shifts.
- Location bands, service groups, employee/position/time facts, free-form station labels,
  section assignment, stable row order, called-off state, manual rows, and source-row hiding
  are available from one work-focused screen.
- The staff drawer supports search and groups candidates as Off today, Working elsewhere,
  and Already scheduled here using that day's published presence.
- Service briefs retain 86/out-of-stock, specials, and pre-shift notes.
- Location and service surfaces collapse independently. Drag/drop and keyboard-reachable
  Move up/down controls use the same revision-guarded row mutation.
- Share requires a preview fingerprint and creates one immutable snapshot per location.
  Preview differences compare row identities and content with the latest snapshot.

## Changed or improved behavior

- Published rows are never copied into mutable Line-up state until an overlay is needed.
  Manual rows and operational annotations remain separate from publication history.
- `schedule.lineup.read`, `schedule.lineup.manage`, and `schedule.lineup.share` are separate
  capabilities. Owner/Admin/Manager defaults receive all three; Employees receive none.
- Every table denies direct authenticated access. Service RPCs enforce workspace, role,
  capability, and location scope; writes use entry/brief revisions.
- Called-off and hidden rows remain visible to managers but are removed before share
  fingerprinting, diffing, and snapshot persistence.
- The staff picker is a desktop drawer and a mobile full-height sheet. Row controls use
  icons and accessible labels; station text saves on blur to avoid per-keystroke conflicts.
- Managers can create, rename, reorder, recolor, and archive configurable sections. Section
  archival atomically clears affected row assignments while preserving those rows.

## Intentionally omitted

- Clock state, attendance, time entries, breaks, labor cost, payroll, tips, compliance, and
  jurisdiction logic.
- Employee Line-up consumption or acknowledgement, notifications, WhatsApp/image sharing,
  and scheduled pulses.
- Phase 6B Time off and Shift change request workflows.

## Research-derived decisions

- Static old-app tests and source established daily navigation, staff candidate groups,
  operational briefs, row ordering, called-off annotations, and versioned sharing. The old
  component hierarchy, styling, route implementation, and database model were not copied.
- The clean model keeps Schedule canonical and stores only operational overlays and
  immutable share versions.

## Verification evidence

- Clean `supabase db reset --local` replay passed through
  `20260820100000_schedule_lineup.sql` after the final migration edits.
- Focused Line-up pgTAP: 35 assertions passed. Full pgTAP passed 13 files and 343
  assertions, including scope denial, stale revisions, called-off share exclusion, real
  snapshot diffs, orphaned-source review state, and section lifecycle behavior.
- Root `typecheck`, `lint`, `test`, and production `build` passed after the final changes.
  Unit/component totals include shared 24, API 27, web 8, and UI 1 tests. The production
  build retains Vite's advisory warning for the approximately 599 kB main chunk.
- Authenticated live API smoke returned the Phase 6A health contract and a published-source
  Line-up read model for the local owner.
- Desktop browser UAT verified published rows, station save, staff grouping, manual staff
  addition, brief save, share preview, immutable share creation, a 1280px non-overflowing
  page viewport, and no application runtime error on a fresh load.
- Mobile browser UAT at 390x844 verified section create, rename, and archive in light and
  dark themes. The body and root remained within the 390px viewport, header actions were
  fully visible, and no console or page errors occurred. Fixed-format row tables retain
  intentional internal horizontal scrolling.

## Unverified

- Verification is local only. No hosted deployment, hosted migration, or hosted authenticated
  smoke was performed.

Phase 6A is locally complete. Do not start Phase 6B until the user explicitly approves that
next slice.
